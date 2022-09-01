export interface Env {
  TWITCH: KVNamespace;

  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
};

type VideoData = {
  id: string;
  duration: string;
  user_id: string;
};

type ChannelData = {
  broadcaster_id: string;
  game_name: string;
  title: string;
};

type ClipData = {
  id: string;
  thumbnail_url: string;
};

type ApiResponse<T> = {
  data: T[];
  error?: string;
};

async function getTwitchApiHeaders(env: Env) {
  let appToken = await env.TWITCH.get("app-token");
  if (!appToken) {
    const response = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${env.TWITCH_CLIENT_ID}&client_secret=${env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: "POST" }
    );
    const tokenData = (await response.json()) as TokenResponse;
    appToken = tokenData.access_token;
    if (!appToken) {
      throw new Error("Token not found!");
    }
    await env.TWITCH.put("app-token", appToken, {
      expirationTtl: tokenData.expires_in - 60,
    });
  }
  return {
    Authorization: `Bearer ${appToken}`,
    "Client-Id": env.TWITCH_CLIENT_ID,
  };
}

export async function handleRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (
    origin == null ||
    (!origin.startsWith("http://localhost:") &&
      origin !== "https://twitchgg.tv" &&
      origin !== "https://gall.dcinside.com" &&
      origin !== "https://cafe.naver.com" &&
      !origin.endsWith(".twitchgg.tv"))
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const allowHeader = { Allow: "GET" };
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers:
        request.headers.get("Access-Control-Request-Method") != null
          ? {
              "Access-Control-Allow-Methods": allowHeader.Allow,
              "Access-Control-Max-Age": "86400",
              ...corsHeaders,
            }
          : allowHeader,
    });
  } else if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: allowHeader,
    });
  }

  const url = new URL(request.url);
  const params = url.searchParams;
  const keySet = new Set(params.keys());
  const result: { [key: string]: { [key: string]: string } } = {};
  if (url.pathname === "/videos") {
    if (keySet.size !== 1 || !keySet.has("id")) {
      throw new Error("Invalid argument!");
    }
    const response = await fetch(
      `https://api.twitch.tv/helix/videos?${params}`,
      { headers: await getTwitchApiHeaders(env) }
    );
    const videoData = (await response.json()) as ApiResponse<VideoData>;
    if (videoData.error) {
      throw new Error(videoData.error);
    }
    for (const v of videoData.data) {
      result[v.id] = { duration: v.duration, userId: v.user_id };
    }
  } else if (url.pathname === "/channels") {
    if (keySet.size !== 1 || !keySet.has("broadcaster_id")) {
      throw new Error("Invalid argument!");
    }
    const response = await fetch(
      `https://api.twitch.tv/helix/channels?${params}`,
      { headers: await getTwitchApiHeaders(env) }
    );
    const channelData = (await response.json()) as ApiResponse<ChannelData>;
    if (channelData.error) {
      throw new Error(channelData.error);
    }
    for (const c of channelData.data) {
      result[c.broadcaster_id] = { title: c.title, game: c.game_name };
    }
  } else if (url.pathname === "/clips") {
    if (keySet.size !== 1 || !keySet.has("id")) {
      throw new Error("Invalid argument!");
    }
    const response = await fetch(
      `https://api.twitch.tv/helix/clips?${params}`,
      { headers: await getTwitchApiHeaders(env) }
    );
    const clipData = (await response.json()) as ApiResponse<ClipData>;
    if (clipData.error) {
      throw new Error(clipData.error);
    }
    for (const c of clipData.data) {
      result[c.id] = { url: c.thumbnail_url.replace(/-preview.*/, ".mp4") };
    }
  } else {
    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      ...corsHeaders,
    },
  });
}
