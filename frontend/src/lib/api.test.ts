import { apiFetch, ApiError, getPendingTasks, generateWeeklyPlan, completeTrainingTask, getGmGameById, submitGameAnalysis, saveAnalysisDraft, listGameAnalyses, searchGmGames } from "./api";
import { getToken, setToken } from "./auth";

function mockFetchResponse(body: unknown, init: { status?: number } = {}) {
  const { status = 200 } = init;
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const fetchMock = jest.fn();

describe("apiFetch", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe("cabeceras y cuerpo", () => {
    it("añade Authorization Bearer si hay token", async () => {
      setToken("jwt-123");
      fetchMock.mockResolvedValue(mockFetchResponse({ ok: true }));

      await apiFetch("/api/v1/users/me");

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers).toMatchObject({ Authorization: "Bearer jwt-123" });
    });

    it("serializa body JSON con Content-Type application/json", async () => {
      fetchMock.mockResolvedValue(mockFetchResponse({ id: 1 }));
      const payload = { username: "pedro", password: "clave1" };

      await apiFetch("/api/v1/users/register", { method: "POST", body: payload });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:8000/api/v1/users/register");
      expect(init.method).toBe("POST");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(init.body).toBe(JSON.stringify(payload));
    });

    it("codifica form como application/x-www-form-urlencoded", async () => {
      fetchMock.mockResolvedValue(mockFetchResponse({ access_token: "abc" }));

      await apiFetch("/api/v1/users/login", {
        method: "POST",
        form: { username: "pedro", password: "clave1" },
      });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(init.body).toBe("username=pedro&password=clave1");
    });

    it("envía FormData sin serializar", async () => {
      fetchMock.mockResolvedValue(mockFetchResponse({ task_id: 1 }));
      const formData = new FormData();
      formData.append("file", "contenido");

      await apiFetch("/api/v1/games/upload-pgn", { method: "POST", body: formData });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.body).toBe(formData);
    });
  });

  describe("respuestas", () => {
    it("devuelve el JSON parseado en respuestas 2xx", async () => {
      fetchMock.mockResolvedValue(mockFetchResponse({ username: "pedro" }));
      const data = await apiFetch<{ username: string }>("/api/v1/users/me");
      expect(data).toEqual({ username: "pedro" });
    });

    it("devuelve undefined en respuestas 204", async () => {
      fetchMock.mockResolvedValue(mockFetchResponse(null, { status: 204 }));
      const data = await apiFetch("/api/v1/games/tasks/1/cancel", { method: "POST" });
      expect(data).toBeUndefined();
    });

    it("lanza ApiError con el detail del servidor", async () => {
      fetchMock.mockResolvedValue(
        mockFetchResponse({ detail: "Usuario ya registrado" }, { status: 400 }),
      );
      const promise = apiFetch("/api/v1/users/register", { method: "POST", body: {} });
      await expect(promise).rejects.toBeInstanceOf(ApiError);
      await expect(promise).rejects.toMatchObject({ status: 400, message: "Usuario ya registrado" });
    });

    it("lanza ApiError con mensaje genérico si no hay body JSON", async () => {
      const badRes = { ok: false, status: 500, json: jest.fn().mockRejectedValue(new Error("no json")) } as unknown as Response;
      fetchMock.mockResolvedValue(badRes);
      const promise = apiFetch("/api/v1/games/");
      await expect(promise).rejects.toMatchObject({ status: 500, message: "Error 500" });
    });

    it("lanza ApiError status 0 en fallo de red", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      const promise = apiFetch("/api/v1/games/");
      await expect(promise).rejects.toMatchObject({ status: 0 });
    });
  });

  describe("manejo de 401", () => {
    it("borra el token y lanza ApiError 401", async () => {
      setToken("token-que-expira");
      fetchMock.mockResolvedValue(
        mockFetchResponse({ detail: "Token expirado" }, { status: 401 }),
      );

      const promise = apiFetch("/api/v1/users/me");
      await expect(promise).rejects.toMatchObject({ status: 401 });
      // jsdom no permite mockear window.location (propiedad no configurable),
      // así que verificamos lo esencial: el token se borra (el redirect a /login
      // es un no-op en jsdom).
      expect(getToken()).toBeNull();
    });
  });
});

describe("wrappers de la API", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("getPendingTasks llama a /training/pending-tasks", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse([]));
    await getPendingTasks();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/training/pending-tasks");
  });

  it("generateWeeklyPlan hace POST a /training/weekly/generate", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ tasks: [] }));
    await generateWeeklyPlan();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/training/weekly/generate");
    expect(init.method).toBe("POST");
  });

  it("completeTrainingTask hace POST con el id de la tarea", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ id: 7 }));
    await completeTrainingTask("7");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/training/tasks/7/complete");
    expect(init.method).toBe("POST");
  });

  it("getGmGameById llama a /gm-games/{id}", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ id: "abc" }));
    await getGmGameById("abc");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/gm-games/abc");
  });

  it("submitGameAnalysis hace POST a /game-analysis/submit con game_type", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ id: 1 }));
    const payload = {
      game_type: "USER" as const,
      pgn: "1. e4 e5",
      white_player: "Pedro",
      black_player: "Rival",
      fases_analisis: { apertura: "", medio_juego: "", final: "" },
      momentos_criticos: { pieza_a_mejorar: "", amenaza_rival: "" },
      factores_posicionales: { material: "", seguridad_rey: "", espacio: "" },
      conclusiones_plan: { plan_estrategico: "", error_conceptual_grave: "", idea_a_repasar: "" },
    };
    await submitGameAnalysis(payload);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/game-analysis/submit");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).game_type).toBe("USER");
  });

  it("saveAnalysisDraft hace POST a /game-analysis/save-draft", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ id: 9, gemini_feedback: null }));
    await saveAnalysisDraft({ game_type: "USER", pgn: "1. e4 e5", white_player: "A", black_player: "B" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/game-analysis/save-draft");
    expect(init.method).toBe("POST");
  });

  it("listGameAnalyses llama a /game-analysis/history", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse([]));
    await listGameAnalyses();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/game-analysis/history");
  });

  it("searchGmGames llama a /gm-games/search con gm_name", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse([]));
    await searchGmGames("Capablanca");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/gm-games/search");
    expect(url).toContain("gm_name=Capablanca");
  });
});
