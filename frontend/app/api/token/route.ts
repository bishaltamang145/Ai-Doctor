import { NextResponse } from 'next/server';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';

type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

// NOTE: you are expected to define the following environment variables in `.env.local`:
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

// don't cache the results
export const revalidate = 0;

export async function POST(req: Request) {
  const requestUrl = new URL(req.url);
  const isLocalRequest = ['localhost', '127.0.0.1', '::1'].includes(requestUrl.hostname);
  const explicitlyAllowed = process.env.ALLOW_INSECURE_TOKEN_ENDPOINT === 'true';

  // Keep local `next start` usable, but do not expose a credential-backed token
  // endpoint on a public production host without an authentication layer.
  if (process.env.NODE_ENV === 'production' && !isLocalRequest && !explicitlyAllowed) {
    return NextResponse.json(
      {
        error:
          'Token generation is disabled on public production hosts until authentication is configured.',
      },
      { status: 503 }
    );
  }

  try {
    if (!LIVEKIT_URL) {
      throw new Error('LIVEKIT_URL is not defined');
    }
    if (!API_KEY) {
      throw new Error('LIVEKIT_API_KEY is not defined');
    }
    if (!API_SECRET) {
      throw new Error('LIVEKIT_API_SECRET is not defined');
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    let roomConfig = body?.room_config
      ? RoomConfiguration.fromJson(
          body.room_config as Parameters<typeof RoomConfiguration.fromJson>[0],
          {
            ignoreUnknownFields: true,
          }
        )
      : undefined;

    if (!roomConfig) {
      const agentName = process.env.AGENT_NAME || process.env.LIVEKIT_AGENT_NAME || 'health-agent';
      roomConfig = RoomConfiguration.fromJson(
        {
          agents: [{ agentName }],
        },
        { ignoreUnknownFields: true }
      );
    }

    // Default to doctor agent
    const selectedAgent = (body?.selectedAgent as string) ?? 'doctor';

    // Generate participant token
    const participantName = 'Alex';
    const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;

    const metadata = JSON.stringify({ selectedAgent });

    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName, metadata },
      roomName,
      roomConfig
    );

    // Return connection details
    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantName,
      participantToken,
    };
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not generate a LiveKit access token.';
    console.error('[token] request failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  roomConfig: RoomConfiguration | undefined
): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '15m',
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  if (roomConfig) {
    at.roomConfig = roomConfig;
  }

  return at.toJwt();
}
