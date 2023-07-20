import { handleRequest } from "../src/handler";

const makeServiceWorkerEnv = require("service-worker-mock");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const global: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: (id: string) => any;

const allowedOrigin = "https://twitchgg.tv";

describe("handleRequest", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env: any = {
    TWITCH: {
      get: jest.fn(),
      put: jest.fn(),
    },
    TWITCH_CLIENT_ID: "id",
    TWITCH_CLIENT_SECRET: "secret",
  };

  beforeEach(() => {
    Object.assign(global, makeServiceWorkerEnv(), {
      fetch: jest.fn(),
      TWITCH_CLIENT_ID: "id",
      TWITCH_CLIENT_SECRET: "secret",
    });
    env.TWITCH = {
      get: jest.fn(),
      put: jest.fn(),
    };
    jest.resetModules();
  });

  it("should return 403 from not allowed origin", async () => {
    const result = await handleRequest(
      new Request("/", {
        method: "GET",
        headers: { Origin: "https://example.com" },
      }),
      env,
    );
    expect(result.status).toEqual(403);
  });

  it("should return 405 if not GET", async () => {
    const result = await handleRequest(
      new Request("/", { method: "POST", headers: { Origin: allowedOrigin } }),
      env,
    );
    expect(result.status).toEqual(405);
    expect(result.headers).toMatchInlineSnapshot(`
      Headers {
        "_map": Map {
          "allow" => "GET",
        },
      }
    `);
  });

  it("should return CORS headers on preflight", async () => {
    const result = await handleRequest(
      new Request("/", {
        method: "OPTIONS",
        headers: {
          Origin: allowedOrigin,
          "Access-Control-Request-Method": "GET",
        },
      }),
      env,
    );
    expect(result.status).toEqual(200);
    expect(result.headers).toMatchInlineSnapshot(`
      Headers {
        "_map": Map {
          "access-control-allow-methods" => "GET",
          "access-control-max-age" => "86400",
          "access-control-allow-origin" => "https://twitchgg.tv",
          "vary" => "Origin",
        },
      }
    `);
  });

  it("should return Allow header on OPTIONS", async () => {
    const result = await handleRequest(
      new Request("/", {
        method: "OPTIONS",
        headers: { Origin: allowedOrigin },
      }),
      env,
    );
    expect(result.status).toEqual(200);
    expect(result.headers).toMatchInlineSnapshot(`
      Headers {
        "_map": Map {
          "allow" => "GET",
        },
      }
    `);
  });

  it("should return 404 on invalid endpoint", async () => {
    const result = await handleRequest(
      new Request("/foo", {
        method: "GET",
        headers: { Origin: allowedOrigin },
      }),
      env,
    );
    expect(result.status).toEqual(404);
  });

  describe("/videos", () => {
    it("should throw on invalid argument", async () => {
      await expect(
        handleRequest(
          new Request("/videos?foo=bar", {
            method: "GET",
            headers: { Origin: allowedOrigin },
          }),
          env,
        ),
      ).rejects.toBeInstanceOf(Error);
    });

    it("should request token and data", async () => {
      global.fetch
        .mockResolvedValueOnce({
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          json: jest.fn().mockResolvedValue(require("./fixtures/token.json")),
        })
        .mockResolvedValueOnce({
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          json: jest.fn().mockResolvedValue(require("./fixtures/videos.json")),
        });
      const result = await handleRequest(
        new Request("/videos?id=335921245&id=1234", {
          method: "GET",
          headers: { Origin: allowedOrigin },
        }),
        env,
      );
      expect(env.TWITCH.put.mock.calls[0]).toMatchInlineSnapshot(`
        [
          "app-token",
          "token",
          {
            "expirationTtl": 3540,
          },
        ]
      `);
      expect(global.fetch.mock.calls[0]).toMatchInlineSnapshot(`
        [
          "https://id.twitch.tv/oauth2/token?client_id=id&client_secret=secret&grant_type=client_credentials",
          {
            "method": "POST",
          },
        ]
      `);
      expect(global.fetch.mock.calls[1]).toMatchInlineSnapshot(`
        [
          "https://api.twitch.tv/helix/videos?id=335921245&id=1234",
          {
            "headers": {
              "Authorization": "Bearer token",
              "Client-Id": "id",
            },
          },
        ]
      `);
      expect(result.status).toEqual(200);
      expect(result.body).toMatchInlineSnapshot(`
        Blob {
          "parts": [
            "{"335921245":{"duration":"3m21s","userId":"141981764"}}",
          ],
          "type": "",
        }
      `);
    });

    it("should use access token from KV", async () => {
      env.TWITCH.get.mockResolvedValueOnce("kvtoken");
      global.fetch.mockResolvedValueOnce({
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        json: jest.fn().mockResolvedValue(require("./fixtures/videos.json")),
      });
      const result = await handleRequest(
        new Request("/videos?id=335921245&id=1234", {
          method: "GET",
          headers: { Origin: allowedOrigin },
        }),
        env,
      );
      expect(global.fetch.mock.calls[0]).toMatchInlineSnapshot(`
        [
          "https://api.twitch.tv/helix/videos?id=335921245&id=1234",
          {
            "headers": {
              "Authorization": "Bearer kvtoken",
              "Client-Id": "id",
            },
          },
        ]
      `);
      expect(result.status).toEqual(200);
      expect(result.body).toMatchInlineSnapshot(`
        Blob {
          "parts": [
            "{"335921245":{"duration":"3m21s","userId":"141981764"}}",
          ],
          "type": "",
        }
      `);
    });
  });

  describe("/channels", () => {
    it("should throw on invalid argument", async () => {
      await expect(
        handleRequest(
          new Request("/channels?foo=bar", {
            method: "GET",
            headers: { Origin: allowedOrigin },
          }),
          env,
        ),
      ).rejects.toBeInstanceOf(Error);
    });

    it("should request token and data", async () => {
      global.fetch
        .mockResolvedValueOnce({
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          json: jest.fn().mockResolvedValue(require("./fixtures/token.json")),
        })
        .mockResolvedValueOnce({
          json: jest
            .fn()
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            .mockResolvedValue(require("./fixtures/channels.json")),
        });
      const result = await handleRequest(
        new Request("/channels?broadcaster_id=141981764&broadcaster_id=1234", {
          method: "GET",
          headers: { Origin: allowedOrigin },
        }),
        env,
      );
      expect(env.TWITCH.put.mock.calls[0]).toMatchInlineSnapshot(`
        [
          "app-token",
          "token",
          {
            "expirationTtl": 3540,
          },
        ]
      `);
      expect(global.fetch.mock.calls[0]).toMatchInlineSnapshot(`
        [
          "https://id.twitch.tv/oauth2/token?client_id=id&client_secret=secret&grant_type=client_credentials",
          {
            "method": "POST",
          },
        ]
      `);
      expect(global.fetch.mock.calls[1]).toMatchInlineSnapshot(`
        [
          "https://api.twitch.tv/helix/channels?broadcaster_id=141981764&broadcaster_id=1234",
          {
            "headers": {
              "Authorization": "Bearer token",
              "Client-Id": "id",
            },
          },
        ]
      `);
      expect(result.status).toEqual(200);
      expect(result.body).toMatchInlineSnapshot(`
        Blob {
          "parts": [
            "{"141981764":{"title":"TwitchDev Monthly Update // May 6, 2021","game":"Science & Technology"}}",
          ],
          "type": "",
        }
      `);
    });

    it("should use access token from KV", async () => {
      env.TWITCH.get.mockResolvedValueOnce("kvtoken");
      global.fetch.mockResolvedValueOnce({
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        json: jest.fn().mockResolvedValue(require("./fixtures/channels.json")),
      });
      const result = await handleRequest(
        new Request("/channels?broadcaster_id=141981764&broadcaster_id=1234", {
          method: "GET",
          headers: { Origin: allowedOrigin },
        }),
        env,
      );
      expect(global.fetch.mock.calls[0]).toMatchInlineSnapshot(`
        [
          "https://api.twitch.tv/helix/channels?broadcaster_id=141981764&broadcaster_id=1234",
          {
            "headers": {
              "Authorization": "Bearer kvtoken",
              "Client-Id": "id",
            },
          },
        ]
      `);
      expect(result.status).toEqual(200);
      expect(result.body).toMatchInlineSnapshot(`
        Blob {
          "parts": [
            "{"141981764":{"title":"TwitchDev Monthly Update // May 6, 2021","game":"Science & Technology"}}",
          ],
          "type": "",
        }
      `);
    });
  });

  describe("/clips", () => {
    it("should throw on invalid argument", async () => {
      await expect(
        handleRequest(
          new Request("/clips?foo=bar", {
            method: "GET",
            headers: { Origin: allowedOrigin },
          }),
          env,
        ),
      ).rejects.toBeInstanceOf(Error);
    });

    it("should request token and data", async () => {
      global.fetch
        .mockResolvedValueOnce({
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          json: jest.fn().mockResolvedValue(require("./fixtures/token.json")),
        })
        .mockResolvedValueOnce({
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          json: jest.fn().mockResolvedValue(require("./fixtures/clips.json")),
        });
      const result = await handleRequest(
        new Request("/clips?id=AwkwardHelplessSalamanderSwiftRage&id=foo", {
          method: "GET",
          headers: { Origin: allowedOrigin },
        }),
        env,
      );
      expect(env.TWITCH.put.mock.calls[0]).toMatchInlineSnapshot(`
        [
          "app-token",
          "token",
          {
            "expirationTtl": 3540,
          },
        ]
      `);
      expect(global.fetch.mock.calls[0]).toMatchInlineSnapshot(`
        [
          "https://id.twitch.tv/oauth2/token?client_id=id&client_secret=secret&grant_type=client_credentials",
          {
            "method": "POST",
          },
        ]
      `);
      expect(global.fetch.mock.calls[1]).toMatchInlineSnapshot(`
        [
          "https://api.twitch.tv/helix/clips?id=AwkwardHelplessSalamanderSwiftRage&id=foo",
          {
            "headers": {
              "Authorization": "Bearer token",
              "Client-Id": "id",
            },
          },
        ]
      `);
      expect(result.status).toEqual(200);
      expect(result.body).toMatchInlineSnapshot(`
        Blob {
          "parts": [
            "{"AwkwardHelplessSalamanderSwiftRage":{"url":"https://clips-media-assets.twitch.tv/157589949.mp4"}}",
          ],
          "type": "",
        }
      `);
    });

    it("should use access token from KV", async () => {
      env.TWITCH.get.mockResolvedValueOnce("kvtoken");
      global.fetch.mockResolvedValueOnce({
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        json: jest.fn().mockResolvedValue(require("./fixtures/clips.json")),
      });
      const result = await handleRequest(
        new Request("/clips?id=AwkwardHelplessSalamanderSwiftRage&id=foo", {
          method: "GET",
          headers: { Origin: allowedOrigin },
        }),
        env,
      );
      expect(global.fetch.mock.calls[0]).toMatchInlineSnapshot(`
        [
          "https://api.twitch.tv/helix/clips?id=AwkwardHelplessSalamanderSwiftRage&id=foo",
          {
            "headers": {
              "Authorization": "Bearer kvtoken",
              "Client-Id": "id",
            },
          },
        ]
      `);
      expect(result.status).toEqual(200);
      expect(result.body).toMatchInlineSnapshot(`
        Blob {
          "parts": [
            "{"AwkwardHelplessSalamanderSwiftRage":{"url":"https://clips-media-assets.twitch.tv/157589949.mp4"}}",
          ],
          "type": "",
        }
      `);
    });
  });
});
