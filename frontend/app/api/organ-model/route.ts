import { NextRequest, NextResponse } from 'next/server';

// Curated 15 verified 3D Sketchfab models for human organs
const VERIFIED_ORGAN_MODELS: Record<string, string> = {
  heart: 'a3f0ea2030214a6bbaa97e7357eebd58',    // "Cardiac Anatomy: External view" by HannahNewey
  liver: 'e9c89546c65f4f97928cb775c0745d23',    // "liver human anatomy" by AkuMURI
  lungs: 'cb992e6cacf5411884828142aec8d596',    // "Human Lung 3D" by 3D EduTex
  brain: 'c9c9d4d671b94345952d012cc2ea7a24',    // "Human Brain" by AH
  kidney: 'e1476ceb1e3b4412af5418eee9c5ed08',   // "Human Kidney" by neshallads
  skeleton: '23a06a148f9145769e822e74fe6b72fc', // "Human skeleton" by aplanva
  stomach: 'e0f1952de7204654ba469c3e887a029b',  // "Realistic Human Stomach" by neshallads
  eye: '73bc0c38a6ac434cb26bae32610f56a2',       // "Human Eye" by 3D EduTex
  muscle: '0954aa04666d45aab9633009318f7b66',   // "Male base muscular anatomy" by CharacterZone
  spine: '92aa35b6d21f4407a295975cb502c4c1',    // "Columna espinal humana / Human spine" by Ualde
  appendix: '8aa01460597a4a70bbbe259c5c478ac7', // "Appendix" by sunnyboy2002
  pancreas: '393c64c5d3644a5ea9a598354ce6e749', // "Pancreas" by CAPTAAINRO
  intestine: '8a1ca8e3ca224cdeb9264674416bde38', // "Small and large intestine" by antonia.sundberg
  thyroid: 'b7e522c4f5dc4cea97d04a3d6773e96f',  // "Thyroid" by ShapeShiftingBlob
  bladder: '3e96c2e9f3f24bb684fc7c8a874a90d6',  // "Human urinary bladder" by axelserrander
};

export async function GET(req: NextRequest) {
  const organ = req.nextUrl.searchParams.get('organ')?.toLowerCase() || '';

  if (VERIFIED_ORGAN_MODELS[organ]) {
    const uid = VERIFIED_ORGAN_MODELS[organ];
    const embedUrl = `https://sketchfab.com/models/${uid}/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&camera=0`;
    return NextResponse.json({ embedUrl, uid });
  }

  // Organ not in verified list — return null so the client can gracefully handle it
  return NextResponse.json({ embedUrl: null, fallbackUrl: null });
}
