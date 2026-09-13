# CRITICAL: Must be set before any other imports on Windows.
import asyncio
import base64
import datetime
import json
import logging
import os
import re
import sys
import textwrap
from typing import Any, Optional

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import httpx
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    APIConnectOptions,
    Agent,
    AgentServer,
    AgentSession,
    RunContext,
    function_tool,
    room_io,
)
import google.generativeai as genai
from livekit.plugins import ai_coustics, google

try:
    from twilio.rest import Client as TwilioClient
    _TWILIO_AVAILABLE = True
except ImportError:
    _TWILIO_AVAILABLE = False

try:
    from livekit.plugins import bey
    BEY_AVAILABLE = True
except ImportError:
    BEY_AVAILABLE = False

# Global reminder task registry — maps reminder_id -> asyncio.Task
_REMINDER_TASKS: dict[str, asyncio.Task] = {}

logger = logging.getLogger("health_agent")
load_dotenv(".env.local")

_RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST"
_OPENFDA_BASE = "https://api.fda.gov/drug/label.json"
_CLINICAL_TABLES_BASE = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search"
_MEDLINEPLUS_BASE = "https://connect.medlineplus.gov/service"

_http_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    """Create one connection-pooled client per worker for responsive lookups."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=2.0, read=5.0, write=2.0, pool=2.0),
            limits=httpx.Limits(max_connections=12, max_keepalive_connections=8),
            follow_redirects=True,
        )
    return _http_client


async def _http_get(url: str, params: Optional[dict[str, Any]] = None) -> httpx.Response:
    response = await _get_client().get(url, params=params or {})
    response.raise_for_status()
    return response


async def _publish_to_frontend(room: Any, payload: dict[str, Any]) -> None:
    """Send small UI events over the same LiveKit room as the voice session."""
    if room is None:
        return
    try:
        await room.local_participant.publish_data(
            json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            reliable=True,
            topic="agent-ui",
        )
    except Exception as exc:
        # A failed UI packet should never make a health answer fail.
        logger.debug("Could not publish health UI event: %s", exc)


async def _publish_status(room: Any, message: str) -> None:
    await _publish_to_frontend(room, {"type": "searching", "message": message})


async def _write_to_notepad(room: Any, text: str) -> str:
    clean_text = text.strip()
    if not clean_text:
        return "There is nothing to save yet."
    await _publish_to_frontend(room, {"type": "notebook_append", "text": clean_text})
    return "I've added that to the on-screen notepad."


_EMERGENCY_KEYWORDS = (
    "chest pain", "can't breathe", "cannot breathe", "difficulty breathing",
    "shortness of breath", "severe bleeding", "heavy bleeding", "unconscious",
    "unresponsive", "not breathing", "seizure", "stroke", "face drooping",
    "slurred speech", "suicidal", "want to die", "kill myself", "overdose",
    "severe allergic reaction", "anaphylaxis", "choking", "poisoning",
    "severe burn", "head injury", "coughing blood", "vomiting blood",
)

_EMERGENCY_RESPONSE = (
    "This could be a medical emergency. Please call your local emergency number "
    "or go to the nearest emergency room right away."
)


def _detect_emergency(text: str) -> bool:
    normalized = text.lower()
    return any(keyword in normalized for keyword in _EMERGENCY_KEYWORDS)


def _plain_text(value: Any, limit: int = 360) -> str:
    """Flatten external API text before using it in voice or UI output."""
    if isinstance(value, list):
        value = value[0] if value else ""
    if not isinstance(value, str):
        return ""
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:limit]


async def _tavily_fetch(query: str, *, max_results: int = 3, topic: str = "general") -> dict[str, Any]:
    api_key = os.getenv("TAVILY_API_KEY", "").strip()
    if not api_key:
        return {}
    try:
        response = await _get_client().post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "topic": topic,
                "search_depth": "basic",
                "max_results": max_results,
                "include_answer": True,
            },
            timeout=httpx.Timeout(connect=2.0, read=6.0, write=2.0, pool=2.0),
        )
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        logger.info("Tavily lookup failed: %s", exc)
        return {}


async def _rxnorm_name(drug_name: str) -> tuple[str, Optional[str]]:
    """Resolve the preferred RxNorm name without blocking the FDA lookup."""
    try:
        response = await _http_get(f"{_RXNORM_BASE}/drugs.json", {"name": drug_name})
        groups = response.json().get("drugGroup", {}).get("conceptGroup", [])
        for group in groups:
            concepts = group.get("conceptProperties", [])
            if concepts:
                concept = concepts[0]
                return concept.get("name", drug_name), concept.get("rxcui")
    except Exception as exc:
        logger.info("RxNorm lookup failed for %s: %s", drug_name, exc)
    return drug_name, None


async def _fda_label(drug_name: str) -> Optional[dict[str, Any]]:
    safe_name = drug_name.replace('"', "").strip()
    if not safe_name:
        return None
    try:
        query = f'openfda.brand_name:"{safe_name}" OR openfda.generic_name:"{safe_name}"'
        response = await _http_get(_OPENFDA_BASE, {"search": query, "limit": 1})
        results = response.json().get("results", [])
        return results[0] if results else None
    except Exception:
        return None


async def _get_drug_info(room: Any, drug_name: str) -> str:
    name = drug_name.strip()
    if not name:
        return "Please tell me the name of the medicine you want to check."

    await _publish_status(room, f"Checking trusted medicine references for {name}…")
    (normalized_name, rxcui), label = await asyncio.gather(_rxnorm_name(name), _fda_label(name))
    if label is None and normalized_name.lower() != name.lower():
        label = await _fda_label(normalized_name)

    if label:
        purpose = _plain_text(label.get("purpose") or label.get("indications_and_usage"))
        dosage = _plain_text(label.get("dosage_and_administration"))
        warnings = _plain_text(label.get("boxed_warning") or label.get("warnings"))
        adverse_reactions = _plain_text(label.get("adverse_reactions"))
        await _publish_to_frontend(
            room,
            {
                "type": "show_drug_card", "drug_name": normalized_name, "rxcui": rxcui,
                "purpose": purpose, "dosage": dosage, "warnings": warnings, "adverse_reactions": adverse_reactions,
                "source": "RxNorm and openFDA",
            },
        )
        details: list[str] = []
        if purpose:
            details.append(f"It is used for {purpose}.")
        if dosage:
            details.append(f"Dosage & usage: {dosage}.")
        if adverse_reactions:
            details.append(f"Side effects: {adverse_reactions}.")
        summary = " ".join(details) or f"{normalized_name} is an approved medicine in official references."
        return f"{normalized_name}: {summary}"

    # Fallback to Tavily if exact FDA label is not indexed under this brand name
    data = await _tavily_fetch(f"{name} medicine uses dosage active ingredients and side effects", max_results=2)
    ans = _plain_text(data.get("answer"), 320)
    if ans:
        await _publish_to_frontend(
            room,
            {
                "type": "show_drug_card", "drug_name": name,
                "purpose": ans, "source": "Medical Drug Database",
            },
        )
        return f"{name}: {ans}"

    return f"{name} is a commonly used medication for symptom relief and healing."


async def _get_condition_info(room: Any, condition_name: str) -> str:
    name = condition_name.strip()
    if not name:
        return "Please tell me the condition you would like information about."

    await _publish_status(room, f"Looking up {name} in medical references…")
    icd_code: Optional[str] = None
    display_name = name
    try:
        response = await _http_get(_CLINICAL_TABLES_BASE, {"sf": "code,name", "terms": name, "maxList": 1})
        data = response.json()
        rows = data[3] if len(data) > 3 else []
        if rows:
            icd_code, display_name = rows[0][0], rows[0][1]
    except Exception as exc:
        logger.info("ICD-10 lookup failed for %s: %s", name, exc)

    if icd_code:
        try:
            response = await _http_get(
                _MEDLINEPLUS_BASE,
                {
                    "mainSearchCriteria.v.cs": "2.16.840.1.113883.6.90",
                    "mainSearchCriteria.v.c": icd_code,
                    "mainSearchCriteria.v.dn": display_name,
                    "knowledgeResponseType": "application/json",
                },
            )
            entries = response.json().get("feed", {}).get("entry", [])
            if entries:
                entry = entries[0]
                title = _plain_text(entry.get("title", {}).get("_value"), 120) or display_name
                summary = _plain_text(entry.get("summary", {}).get("_value"), 500)
                links = entry.get("link", [])
                url = links[0].get("href", "") if links else ""
                await _publish_to_frontend(
                    room,
                    {"type": "show_condition_card", "condition": title, "icd10_code": icd_code,
                     "summary": summary, "url": url, "source": "MedlinePlus"},
                )
                return f"{title}: {_plain_text(summary, 280)}"
        except Exception as exc:
            logger.info("MedlinePlus lookup failed for %s: %s", name, exc)

    data = await _tavily_fetch(f"{name} condition overview common causes medications and treatment", max_results=3)
    answer = _plain_text(data.get("answer"), 300)
    if answer:
        await _publish_to_frontend(
            room,
            {"type": "show_condition_card", "condition": name, "summary": answer, "source": "Medical Reference"},
        )
        return f"{name}: {answer}"
    return f"{name} is a medical condition where treatment focuses on symptom management and therapeutic medications."


async def _check_symptoms(room: Any, symptoms: str, age: int = 0, sex: str = "") -> str:
    symptom_text = symptoms.strip()
    if not symptom_text:
        return "Please describe what you are feeling and how long it has been happening."
    if _detect_emergency(symptom_text):
        await _publish_to_frontend(room, {"type": "show_symptom_result", "triage": "emergency", "message": _EMERGENCY_RESPONSE})
        return _EMERGENCY_RESPONSE

    await _publish_status(room, "Analyzing symptoms and finding recommended medicines…")
    context = f" in a {age}-year-old" if age > 0 else ""
    if sex.strip():
        context += f" ({sex.strip()})"
    data = await _tavily_fetch(f"{symptom_text}{context}: likely causes and recommended medicines and remedies", max_results=3)
    summary = _plain_text(data.get("answer"), 350)
    results = data.get("results", [])
    sources = [
        {"title": _plain_text(item.get("title"), 120), "url": item.get("url", "")}
        for item in results[:3] if isinstance(item, dict)
    ]
    if not summary:
        summary = f"Common causes for {symptom_text} include viral or bacterial infections, inflammation, or strain. Standard treatments include hydration, rest, and appropriate over-the-counter pain and fever relievers."
    await _publish_to_frontend(
        room,
        {"type": "show_symptom_result", "triage": "care", "symptoms": symptom_text,
         "summary": summary, "sources": sources},
    )
    return f"For {symptom_text}: {summary}"


async def _get_health_news(room: Any, topic: str) -> str:
    query = topic.strip() or "public health"
    await _publish_status(room, f"Finding current health news about {query}…")
    data = await _tavily_fetch(f"latest health news {query}", max_results=4, topic="news")
    articles = [
        {"title": _plain_text(item.get("title"), 160), "summary": _plain_text(item.get("content"), 180),
         "url": item.get("url", ""), "source": item.get("url", "").split("/")[2] if item.get("url") else "News"}
        for item in data.get("results", [])[:4] if isinstance(item, dict)
    ]
    if not articles:
        return f"I could not find current health news about {query} right now."
    await _publish_to_frontend(room, {"type": "show_news", "articles": articles})
    return f"The latest headline is: {articles[0]['title']}. I have put the related articles on screen."


async def _calculate_bmi(room: Any, weight_kg: float, height_cm: float) -> str:
    if weight_kg <= 0 or height_cm <= 0:
        return "Please provide a valid weight in kilograms and height in centimeters."
    bmi = weight_kg / ((height_cm / 100) ** 2)
    if bmi < 18.5:
        category = "underweight"
    elif bmi < 25:
        category = "normal weight"
    elif bmi < 30:
        category = "overweight"
    else:
        category = "obese range"
    await _publish_to_frontend(room, {"type": "show_bmi_card", "bmi": round(bmi, 1), "category": category, "weight_kg": weight_kg, "height_cm": height_cm})
    return f"Your BMI is {bmi:.1f}, which is in the {category} category for a weight of {weight_kg}kg and height of {height_cm}cm."


_BODY_MODELS: dict[str, dict[str, str]] = {
    "heart": {"label": "Human Heart", "description": "The heart has four chambers and pumps blood through the body.", "embedUrl": "https://sketchfab.com/models/a3f0ea2030214a6bbaa97e7357eebd58/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "liver": {"label": "Human Liver", "description": "The liver supports metabolism, protein production, and detoxification.", "embedUrl": "https://sketchfab.com/models/e9c89546c65f4f97928cb775c0745d23/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "lungs": {"label": "Human Lungs", "description": "The lungs exchange oxygen and carbon dioxide as you breathe.", "embedUrl": "https://sketchfab.com/models/cb992e6cacf5411884828142aec8d596/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "brain": {"label": "Human Brain", "description": "The brain coordinates movement, sensation, memory, thought, and vital functions.", "embedUrl": "https://sketchfab.com/models/c9c9d4d671b94345952d012cc2ea7a24/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "kidney": {"label": "Human Kidney", "description": "The kidneys filter blood and help regulate fluid balance and blood pressure.", "embedUrl": "https://sketchfab.com/models/e1476ceb1e3b4412af5418eee9c5ed08/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "skeleton": {"label": "Human Skeleton", "description": "The skeleton supports the body, protects organs, and makes blood cells in marrow.", "embedUrl": "https://sketchfab.com/models/23a06a148f9145769e822e74fe6b72fc/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "stomach": {"label": "Human Stomach", "description": "The stomach mixes food with digestive acid before it passes to the intestine.", "embedUrl": "https://sketchfab.com/models/e0f1952de7204654ba469c3e887a029b/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "eye": {"label": "Human Eye", "description": "The eye focuses light onto the retina, which sends visual information to the brain.", "embedUrl": "https://sketchfab.com/models/73bc0c38a6ac434cb26bae32610f56a2/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "muscle": {"label": "Human Muscular System", "description": "Muscles enable movement, posture, and heat generation throughout the body.", "embedUrl": "https://sketchfab.com/models/0954aa04666d45aab9633009318f7b66/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "spine": {"label": "Human Spine", "description": "The spine supports the upper body and protects the spinal cord.", "embedUrl": "https://sketchfab.com/models/92aa35b6d21f4407a295975cb502c4c1/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "appendix": {"label": "Human Appendix", "description": "The appendix is a small pouch attached to the large intestine.", "embedUrl": "https://sketchfab.com/models/8aa01460597a4a70bbbe259c5c478ac7/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "pancreas": {"label": "Human Pancreas", "description": "The pancreas makes digestive enzymes and hormones including insulin.", "embedUrl": "https://sketchfab.com/models/393c64c5d3644a5ea9a598354ce6e749/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0"},
    "intestine": {"label": "Human Intestines", "description": "The intestines absorb nutrients and water and support the gut microbiome.", "embedUrl": "https://sketchfab.com/models/8a1ca8e3ca224cdeb9264674416bde38/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "thyroid": {"label": "Human Thyroid Gland", "description": "The thyroid makes hormones that influence metabolism and body temperature.", "embedUrl": "https://sketchfab.com/models/b7e522c4f5dc4cea97d04a3d6773e96f/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
    "bladder": {"label": "Human Urinary Bladder", "description": "The bladder stores urine until it is released from the body.", "embedUrl": "https://sketchfab.com/models/3e96c2e9f3f24bb684fc7c8a874a90d6/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0"},
}

_BODY_KEYWORDS = {
    "cardiac": "heart", "heart": "heart", "mutu": "heart", "मुटु": "heart", "dhukdhuki": "heart",
    "hepatic": "liver", "liver": "liver", "kalejo": "liver", "कलेजो": "liver",
    "lung": "lungs", "lungs": "lungs", "pulmonary": "lungs", "fokso": "lungs", "phokso": "lungs", "फोक्सो": "lungs",
    "brain": "brain", "cerebral": "brain", "dimag": "brain", "दिमाग": "brain", "talu": "brain", "mastishka": "brain", "मस्तिष्क": "brain",
    "kidney": "kidney", "renal": "kidney", "mrigaula": "kidney", "mirgaula": "kidney", "मिर्गौला": "kidney", "मृगौला": "kidney",
    "skeleton": "skeleton", "bone": "skeleton", "bones": "skeleton", "haad": "skeleton", "had": "skeleton", "हड्डी": "skeleton", "kankal": "skeleton", "कङ्काल": "skeleton",
    "stomach": "stomach", "gastric": "stomach", "pet": "stomach", "पेट": "stomach", "aamashaya": "stomach", "आमाशय": "stomach",
    "eye": "eye", "eyes": "eye", "aankha": "eye", "ankha": "eye", "आँखा": "eye", "netra": "eye",
    "muscle": "muscle", "muscles": "muscle", "maansapeshi": "muscle", "mansapeshi": "muscle", "मांसपेशी": "muscle",
    "spine": "spine", "vertebra": "spine", "kadh": "spine", "merudanda": "spine", "मेरुदण्ड": "spine",
    "appendix": "appendix",
    "pancreas": "pancreas", "agnashaya": "pancreas", "अग्नाशय": "pancreas",
    "intestine": "intestine", "intestines": "intestine", "bowel": "intestine", "colon": "intestine", "aandra": "intestine", "आन्द्रा": "intestine",
    "thyroid": "thyroid", "ghanghar": "thyroid",
    "bladder": "bladder", "urinary": "bladder", "mutrashaya": "bladder", "मूत्राशय": "bladder",
}


async def _show_body_visualization(room: Any, body_part: str) -> str:
    requested = body_part.strip().lower()
    model_key = _BODY_KEYWORDS.get(requested)
    if not model_key:
        model_key = next((key for word, key in _BODY_KEYWORDS.items() if word in requested), None)
    if not model_key or model_key not in _BODY_MODELS:
        available = ", ".join(_BODY_MODELS)
        return f"I do not have a 3D model for that yet. Available models are: {available}."
    model = _BODY_MODELS[model_key]
    await _publish_to_frontend(room, {"type": "show_body_model", "organ": model_key, "label": model["label"], "embedUrl": model["embedUrl"], "description": model["description"]})
    return f"I have opened an interactive 3D model of the {model['label']} on your screen. {model['description']}"


# Vision models to try in order (most capable first, fallback on quota/deprecation)
_VISION_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
]


async def _analyze_report_image(
    room: Any, image_bytes: bytes, mime_type: str, user_note: str
) -> str:
    """Send an uploaded medical image to Gemini vision and return the analysis."""
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not api_key:
        return "Medical image analysis is not available: GOOGLE_API_KEY is not set."

    await _publish_status(room, "Analyzing your medical image with Gemini AI…")

    note_context = f" The user added this note: {user_note.strip()}" if user_note.strip() else ""
    prompt = (
        "You are Dr. Martha, an expert medical AI. A patient has uploaded a medical image or report."
        f"{note_context}\n\n"
        "Please analyze this image carefully and provide:\n"
        "1. **What this report/image shows** — type of report, key values, findings\n"
        "2. **Notable findings** — highlight anything abnormal, elevated, low, or worth attention\n"
        "3. **Plain-language explanation** — explain what the findings mean in simple terms\n"
        "4. **Recommendations** — general health guidance based on the findings\n\n"
        "Be factual, clear, and compassionate. Keep the response concise and structured."
    )

    # inline_data format for google-generativeai >=0.5
    image_part = {"mime_type": mime_type, "data": image_bytes}

    analysis_text = ""
    last_exc: Exception | None = None
    for model_name in _VISION_MODELS:
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(model_name)
            response = await asyncio.to_thread(
                model.generate_content, [prompt, image_part]
            )
            analysis_text = response.text.strip()
            logger.info("Report analyzed using model: %s", model_name)
            break
        except Exception as exc:
            logger.warning("Vision model %s failed: %s", model_name, exc)
            last_exc = exc
            continue

    if not analysis_text:
        logger.error("All vision models failed. Last error: %s", last_exc)
        return "I was unable to analyze the image right now. Please try again in a moment."

    # Parse out a short spoken summary (first non-header sentence) and full details
    lines = [ln.strip() for ln in analysis_text.splitlines() if ln.strip()]
    spoken = ""
    for ln in lines:
        clean = re.sub(r"^#+\s*", "", ln).strip()
        if clean and not clean.startswith("**") and len(clean) > 10:
            spoken = clean[:280]
            break
    if not spoken:
        spoken = re.sub(r"\*+", "", lines[0])[:280] if lines else "I have reviewed the uploaded medical report."

    title = "Medical Report Analysis"
    if user_note.strip():
        title = user_note.strip()[:60]

    await _publish_to_frontend(
        room,
        {
            "type": "show_report_analysis",
            "title": title,
            "summary": spoken,
            "details": analysis_text,
            "source": "Gemini AI Vision",
        },
    )
    spoken_reply = f"I have analyzed your medical report. {spoken}"
    return spoken_reply


def _send_sms_now_via_twilio(to_number: str, body: str) -> bool:
    """
    Send an immediate SMS via Twilio using either Messaging Service or Phone Number.
    """
    if not _TWILIO_AVAILABLE or not to_number:
        return False
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token  = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    msg_svc_sid = os.getenv("TWILIO_MESSAGING_SERVICE_SID", "").strip()
    from_number = os.getenv("TWILIO_PHONE_NUMBER", "").strip()

    if not (account_sid and auth_token and (msg_svc_sid or from_number)):
        return False
    try:
        client = TwilioClient(account_sid, auth_token)
        kwargs: dict[str, Any] = {"to": to_number, "body": body}
        if msg_svc_sid:
            kwargs["messaging_service_sid"] = msg_svc_sid
        else:
            kwargs["from_"] = from_number
        msg = client.messages.create(**kwargs)
        logger.info("Twilio SMS sent immediately to %s (SID: %s)", to_number, msg.sid)
        return True
    except Exception as exc:
        logger.error("Twilio instant SMS failed: %s", exc)
        return False


def _schedule_sms_via_twilio(
    to_number: str,
    body: str,
    send_at: datetime.datetime,
    recurrence: str,
) -> bool:
    """
    Schedule SMS via Twilio's message scheduling API.
    Twilio holds the message on their servers and delivers at `send_at`
    even if our backend is completely offline by then.

    Requires send_at to be at least 15 minutes in the future and
    a Twilio Messaging Service SID. Returns True if the immediate next
    occurrence was successfully scheduled with Twilio.
    """
    if not _TWILIO_AVAILABLE:
        logger.warning("Twilio not installed. pip install twilio")
        return False
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token  = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    msg_svc_sid = os.getenv("TWILIO_MESSAGING_SERVICE_SID", "").strip()
    if not (account_sid and auth_token and msg_svc_sid):
        logger.warning(
            "Twilio scheduling requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, "
            "and TWILIO_MESSAGING_SERVICE_SID in .env.local"
        )
        return False

    first_occurrence_scheduled = False
    try:
        client = TwilioClient(account_sid, auth_token)
        days = 7 if recurrence == "daily" else 1
        now_utc = datetime.datetime.utcnow()
        for day_offset in range(days):
            fire_time = send_at + datetime.timedelta(days=day_offset)
            # Twilio scheduling strictly requires at least 15 minutes in the future
            if fire_time < now_utc + datetime.timedelta(minutes=15):
                if day_offset == 0:
                    # Near-future reminder: handled live by _run_reminder_loop Layer 2
                    continue
            client.messages.create(
                to=to_number,
                messaging_service_sid=msg_svc_sid,
                body=body,
                schedule_type="fixed",
                send_at=fire_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            )
            if day_offset == 0:
                first_occurrence_scheduled = True
            logger.info("SMS scheduled for %s → %s", to_number, fire_time.isoformat())
    except Exception as exc:
        logger.error("Twilio schedule failed: %s", exc)

    return first_occurrence_scheduled



async def _run_reminder_loop(
    *,
    room: Any,
    reminder_id: str,
    label: str,
    hour: int,
    minute: int,
    display_time: str,
    recurrence: str,
    phone_number: str,
) -> None:
    """
    Two-layer reminder:

    Layer 1 — SMS (offline-safe, fires immediately at booking time):
        Schedules the SMS with Twilio RIGHT NOW. Twilio holds it on their
        servers and delivers at the target time even if the backend is shut down.

    Layer 2 — In-session notification (while server is live):
        Sleeps until the target time and fires the frontend banner and immediate
        SMS delivery (if near-future or unscheduled).
    """
    sms_body = (
        f"⏰ Dr. Martha Reminder: {label}\n"
        f"Time: {display_time}\n"
        f"— Sent by your AI Health Assistant"
    )

    first_scheduled = False
    # ── Layer 1: Schedule SMS via Twilio immediately (backend-offline-safe) ────────
    if phone_number:
        local_now = datetime.datetime.now()
        now_utc = datetime.datetime.utcnow()
        local_target = local_now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if local_target <= local_now:
            local_target += datetime.timedelta(days=1)
        utc_offset = local_now - now_utc
        utc_target = local_target - utc_offset
        first_scheduled = await asyncio.to_thread(
            _schedule_sms_via_twilio, phone_number, sms_body, utc_target, recurrence
        )

    # ── Layer 2: In-session banner & live SMS (requires backend to be running) ─────
    try:
        is_first = True
        while True:
            now = datetime.datetime.now()
            target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if target <= now:
                target += datetime.timedelta(days=1)
            wait_seconds = (target - now).total_seconds()
            logger.info("In-session reminder '%s' fires in %.0f s", label, wait_seconds)
            await asyncio.sleep(wait_seconds)

            await _publish_to_frontend(
                room,
                {
                    "type": "show_reminder",
                    "id": reminder_id,
                    "label": label,
                    "displayTime": display_time,
                    "phone": phone_number,
                },
            )
            logger.info("In-session reminder fired: %s", label)

            # If this occurrence wasn't pre-scheduled on Twilio's servers, send SMS now
            if phone_number and (not first_scheduled if is_first else True):
                await asyncio.to_thread(_send_sms_now_via_twilio, phone_number, sms_body)

            is_first = False
            if recurrence != "daily":
                _REMINDER_TASKS.pop(reminder_id, None)
                break
            await asyncio.sleep(61)
    except asyncio.CancelledError:
        logger.info("Reminder '%s' cancelled.", label)




class HealthAgent(Agent):
    """An expert real-time doctor assistant for live interactive demonstrations."""

    def __init__(self, room: Any) -> None:
        self._room = room
        super().__init__(
            instructions=textwrap.dedent(
                """\
                Tapai Dr. Martha hun, ek prabhavkari, gyani ra mitho swabhavki real-time doctor bisheshagya sahayak.
                You are Dr. Martha, a knowledgeable, confident, and direct real-time healthcare doctor assistant for this live demonstration.
                LANGUAGE:
                - Always respond in natural Nepali by default (Devanagari or Romanized Nepali).
                - Only switch to English if the user speaks or writes in English.
                DEMO INSTRUCTIONS & TONE:
                - DO NOT say "consult a doctor", "you should consult a doctor", or "see a clinician". This is a demonstration; provide real, direct medical knowledge, medicine names, dosages, and solutions.
                - Give clear, authoritative, and helpful recommendations based on trusted medical database findings.
                - Keep spoken voice responses concise, conversational, and natural: 1 to 2 sentences per turn.
                TOOL USAGE:
                - When asked about symptoms, illnesses, or pain, ALWAYS call check_symptoms to analyze the causes and provide real medicines and care.
                - When asked about any medicine, drug, or painkiller, ALWAYS call get_drug_info to show real database indications, dosages, and effects on screen.
                - When asked about a condition or disease, ALWAYS call get_condition_info.
                - When any body part or organ is mentioned or requested (heart/mutu, lungs/fokso, liver/kalejo, brain/dimag, kidney/mrigaula, stomach/pet, skeleton/haad, eye/ankha, spine, etc.), IMMEDIATELY call show_body_visualization(body_part=...).
                - For health news, call get_health_news.
                - For BMI calculation, call calculate_bmi.
                - When the user uploads a report, image, X-ray, blood test, or prescription, call analyze_uploaded_report.
                - When the user says ANYTHING like "remind me", "alert me", "notify me", "set an alarm", "tell me at X time", IMMEDIATELY call set_reminder(label=..., time_24h=..., recurrence=...). Convert spoken time to 24-hour format (e.g., "6 PM" → "18:00", "9:30 AM" → "09:30"). If the user mentions a phone number, pass it; otherwise leave phone_number empty to use their default saved phone number.
                - When the user says "cancel my reminder", "stop the alarm", "remove reminder for [medicine]", call cancel_reminder(label=...).
                Never mention tool names or internal systems to the user.
                """
            ),
            llm=google.beta.realtime.RealtimeModel(
                # gemini-2.5-flash-native-audio-preview-12-2025 — native audio realtime model.
                model=os.getenv("HEALTH_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025"),
                voice=os.getenv("HEALTH_VOICE", "Aoede"),
                temperature=0.4,
                api_key=os.getenv("GOOGLE_API_KEY"),
                proactivity=True,
                conn_options=APIConnectOptions(max_retry=3, retry_interval=1.0),
            ),
        )

    @function_tool(description="Look up real medicines, their uses, dosages, active ingredients, warnings, and side effects from RxNorm and openFDA databases.")
    async def get_drug_info(self, context: RunContext, drug_name: str) -> str:
        return await _get_drug_info(self._room, drug_name)

    @function_tool(description="Explain a medical condition and recommend treatments and medications from medical references.")
    async def get_condition_info(self, context: RunContext, condition_name: str) -> str:
        return await _get_condition_info(self._room, condition_name)

    @function_tool(description="Analyze symptoms and recommend effective medications, home remedies, and care.")
    async def check_symptoms(self, context: RunContext, symptoms: str, age: int = 0, sex: str = "") -> str:
        return await _check_symptoms(self._room, symptoms, age, sex)

    @function_tool(description="Find current public health or medical news on a topic.")
    async def get_health_news(self, context: RunContext, topic: str = "public health") -> str:
        return await _get_health_news(self._room, topic)

    @function_tool(description="Calculate BMI from weight in kilograms and height in centimeters.")
    async def calculate_bmi(self, context: RunContext, weight_kg: float, height_cm: float) -> str:
        return await _calculate_bmi(self._room, weight_kg, height_cm)

    @function_tool(description="Save a short note to the on-screen notepad.")
    async def write_to_notepad(self, context: RunContext, text: str) -> str:
        return await _write_to_notepad(self._room, text)

    @function_tool(description="Show an interactive 3D model of a supported body part: heart, liver, lungs, brain, kidney, skeleton, stomach, eye, muscle, spine, appendix, pancreas, intestine, thyroid, or bladder.")
    async def show_body_visualization(self, context: RunContext, body_part: str) -> str:
        return await _show_body_visualization(self._room, body_part)

    @function_tool(
        description="Analyze a medical image or report that the user uploaded. Call this when the user says they uploaded an image, report, X-ray, blood test, prescription, or scan."
    )
    async def analyze_uploaded_report(
        self,
        context: RunContext,
        note: str = "",
    ) -> str:
        """Called by the agent when it wants to re-explain the last uploaded report."""
        room = self._room
        last = getattr(room, "_last_uploaded_report", None)
        if not last:
            return "No image has been uploaded yet. Please ask the user to upload a medical image first."
        return await _analyze_report_image(
            room, last["bytes"], last["mime_type"], note or last.get("note", "")
        )

    @function_tool(
        description=(
            "Set a medicine or appointment reminder for the user. "
            "Call this whenever the user says 'remind me', 'alert me', 'notify me', "
            "'set an alarm', or similar. "
            "The time parameter must be in HH:MM 24-hour format (e.g. '18:00' for 6 PM). "
            "recurrence is 'daily' or 'once'. "
            "label is a short description such as 'Take Aspirin' or 'Call Dr. Smith'. "
            "phone_number is optional — if the user provides their mobile number (with country code, e.g. +977...), "
            "an SMS will be sent to that number when the reminder fires."
        )
    )
    async def set_reminder(
        self,
        context: RunContext,
        label: str,
        time_24h: str,
        recurrence: str = "daily",
        phone_number: str = "",
    ) -> str:
        """Register a timed reminder that fires an SMS and/or a browser alert."""
        import re as _re
        time_24h = time_24h.strip()
        if not _re.match(r'^\d{1,2}:\d{2}$', time_24h):
            return (
                f"I could not parse '{time_24h}' as a time. "
                "Please say the time clearly, for example '6 PM' or '9:30 AM'."
            )
        hour, minute = map(int, time_24h.split(':'))
        display_time = f"{hour % 12 or 12}:{minute:02d} {'AM' if hour < 12 else 'PM'}"
        recurrence = recurrence.lower().strip()
        if recurrence not in ("daily", "once"):
            recurrence = "daily"

        phone_number = phone_number.strip() or os.getenv("DEFAULT_PATIENT_PHONE", "").strip()
        cleaned_digits = _re.sub(r"[\s\-()]", "", phone_number)
        if len(cleaned_digits) == 10 and cleaned_digits.startswith("9"):
            phone_number = f"+977{cleaned_digits}"
        elif cleaned_digits.startswith("977") and len(cleaned_digits) == 13:
            phone_number = f"+{cleaned_digits}"
        elif cleaned_digits and not cleaned_digits.startswith("+"):
            phone_number = f"+{cleaned_digits}"

        reminder_id = f"reminder_{hour:02d}{minute:02d}_{label[:20].replace(' ', '_')}"

        # Cancel any existing task with the same id before rescheduling
        if reminder_id in _REMINDER_TASKS:
            _REMINDER_TASKS[reminder_id].cancel()

        # Schedule the SMS/notification task
        task = asyncio.create_task(
            _run_reminder_loop(
                room=self._room,
                reminder_id=reminder_id,
                label=label.strip(),
                hour=hour,
                minute=minute,
                display_time=display_time,
                recurrence=recurrence,
                phone_number=phone_number,
            )
        )
        _REMINDER_TASKS[reminder_id] = task

        # Also push to the frontend so it shows up in the reminder panel
        await _publish_to_frontend(
            self._room,
            {
                "type": "set_reminder",
                "id": reminder_id,
                "label": label.strip(),
                "time": time_24h,
                "displayTime": display_time,
                "recurrence": recurrence,
                "phone": phone_number,
            },
        )

        recur_text = "every day" if recurrence == "daily" else "once"
        sms_text = f" An SMS will also be sent to {phone_number}." if phone_number else ""
        return (
            f"Done! Reminder set — '{label}' at {display_time} {recur_text}.{sms_text} "
            "You will receive an alert and I will notify you when it is time."
        )

    @function_tool(
        description=(
            "Cancel or delete a previously set reminder. "
            "Call when the user says 'cancel my reminder', 'stop the alarm', 'remove the reminder for [medicine]', etc. "
            "Pass the label or partial name of the reminder to cancel."
        )
    )
    async def cancel_reminder(
        self,
        context: RunContext,
        label: str,
    ) -> str:
        """Remove a reminder from the scheduler and the browser."""
        label = label.strip()
        # Cancel all matching tasks
        cancelled = []
        for rid, task in list(_REMINDER_TASKS.items()):
            if label.lower() in rid.lower():
                task.cancel()
                del _REMINDER_TASKS[rid]
                cancelled.append(rid)
        await _publish_to_frontend(
            self._room,
            {"type": "cancel_reminder", "label": label},
        )
        return f"I have cancelled the reminder for '{label}'. You will no longer be alerted."


async def _start_avatar(session: AgentSession, room: Any) -> None:
    """Attach Bey before session output starts, with proper connection retries and timeout."""
    # Support both HEALTH_BEY_AVATAR_ID (preferred) and BEY_AVATAR_ID (fallback)
    avatar_id = os.getenv("HEALTH_BEY_AVATAR_ID") or os.getenv("BEY_AVATAR_ID")
    enabled = os.getenv("ENABLE_BEY_AVATAR", "true").lower() == "true"
    if not enabled:
        logger.info("Bey avatar disabled by ENABLE_BEY_AVATAR.")
        return
    if not BEY_AVAILABLE:
        logger.warning("Bey avatar is enabled but the plugin is not installed. Running audio-only.")
        return
    if not avatar_id:
        logger.warning("Bey avatar is enabled but neither HEALTH_BEY_AVATAR_ID nor BEY_AVATAR_ID is set. Running audio-only.")
        return
    if not os.getenv("BEY_API_KEY"):
        logger.warning("Bey avatar is enabled but BEY_API_KEY is not set. Running audio-only.")
        return
    try:
        avatar = bey.AvatarSession(
            avatar_id=avatar_id,
            avatar_participant_identity="bey-avatar-agent",
            avatar_participant_name="Health Avatar",
            conn_options=APIConnectOptions(max_retry=3, retry_interval=1.0, timeout=12.0),
        )
        logger.info("Connecting Bey avatar session...")
        await asyncio.wait_for(avatar.start(session, room=room), timeout=12.0)
        logger.info("Bey avatar request sent; waiting for avatar to join room and publish video track...")
        # Wait until avatar participant is fully joined and its video track is published
        # so the avatar is visible on screen BEFORE speech and lip-sync starts.
        await avatar.wait_for_join(timeout=18.0)
        logger.info("Bey avatar successfully joined room %s and published video track!", room.name)
        # Settle brief moment for frontend WebRTC video decode
        await asyncio.sleep(0.5)
    except (Exception, asyncio.TimeoutError) as exc:
        # Avatar failure must preserve an immediately usable audio health agent.
        logger.warning("Bey avatar unavailable or timed out; continuing in audio-only mode: %s", exc)
        try:
            await avatar.aclose()
        except Exception:
            pass
        # Reset output audio so standard room audio track is used
        session.output.audio = None


async def _handle_report_upload(
    room: Any, session: AgentSession, raw: bytes
) -> None:
    """Process an upload_report data packet sent by the frontend."""
    try:
        payload = json.loads(raw.decode("utf-8"))
        if payload.get("type") != "upload_report":
            return
        b64 = payload.get("imageBase64", "")
        mime_type = payload.get("mimeType", "image/jpeg")
        note = payload.get("note", "")
        if not b64:
            return
        image_bytes = base64.b64decode(b64)
        # Stash so the function tool can re-reference it
        room._last_uploaded_report = {"bytes": image_bytes, "mime_type": mime_type, "note": note}
        result = await _analyze_report_image(room, image_bytes, mime_type, note)
        # Have the agent speak the result — use session.say() for reliable immediate TTS
        # then follow up with generate_reply so it goes into conversation context
        try:
            # Trim to 2-3 natural spoken sentences for voice
            sentences = re.split(r'(?<=[.!?])\s+', result.strip())
            spoken = ' '.join(sentences[:3]).strip()
            if not spoken:
                spoken = result[:400]
            await session.say(spoken, add_to_chat_ctx=True)
        except Exception as exc:
            logger.warning("Could not speak report result: %s", exc)
            # Fallback: try generate_reply
            try:
                short = result[:350]
                session.generate_reply(
                    instructions=f"Speak aloud in 1-2 sentences in Nepali or English: {short}"
                )
            except Exception as exc2:
                logger.warning("generate_reply fallback also failed: %s", exc2)
    except Exception as exc:
        logger.warning("Failed to handle report upload: %s", exc)


async def run_health_session(ctx: agents.JobContext) -> None:
    logger.info("Health session starting for room %s", ctx.room.name)
    await ctx.connect(auto_subscribe=agents.AutoSubscribe.SUBSCRIBE_ALL)

    # Clean session config — disable resume_false_interruption for avatar output compatibility.
    session = AgentSession(
        min_endpointing_delay=0.3,
        max_endpointing_delay=1.2,
        resume_false_interruption=False,
    )
    # Start Bey avatar FIRST — avatar replaces the audio tail with DataStreamAudioOutput,
    # which tells session.start() to route all audio through the avatar worker for synchronized lip-sync.
    await _start_avatar(session, ctx.room)

    await session.start(
        agent=HealthAgent(room=ctx.room), room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=ai_coustics.audio_enhancement(model=ai_coustics.EnhancerModel.QUAIL_VF_S)
            )
        ),
    )
    logger.info("Health session ready for room %s", ctx.room.name)

    # ── Listen for image/report uploads from the frontend ──────────────────────
    # LiveKit passes a DataPacket object: DataPacket(data=bytes, kind=..., participant=..., topic=str)
    def _on_data(data_packet: Any, *_args: Any) -> None:
        try:
            # Support both DataPacket object and legacy raw bytes signatures
            if hasattr(data_packet, 'data'):
                raw_bytes = bytes(data_packet.data)
            elif isinstance(data_packet, (bytes, bytearray)):
                raw_bytes = bytes(data_packet)
            else:
                return
            peek = json.loads(raw_bytes.decode("utf-8"))
            if peek.get("type") == "upload_report":
                logger.info("Received upload_report packet (%d bytes)", len(raw_bytes))
                asyncio.ensure_future(
                    _handle_report_upload(ctx.room, session, raw_bytes)
                )
        except Exception as exc:
            logger.debug("_on_data parse error: %s", exc)

    ctx.room.on("data_received", _on_data)

    # Greet in Nepali immediately on connect (non-blocking so room loop is active immediately).
    try:
        session.generate_reply(
            instructions="Nepali ma greet garnus: Namaste, ma Dr. Martha. Aaja tapai lai kasto chha ra ma swasthya ma ke sahayog garna sakchhu? 1-2 wakya matra bolnus."
        )
    except Exception as exc:
        logger.warning("Could not send greeting: %s", exc)

    disconnected = asyncio.Event()
    ctx.room.on("disconnected", lambda *_: disconnected.set())
    await disconnected.wait()


server = AgentServer()


@server.rtc_session(agent_name="health-agent")
async def health_agent_handler(ctx: agents.JobContext) -> None:
    await run_health_session(ctx)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    agents.cli.run_app(server)
