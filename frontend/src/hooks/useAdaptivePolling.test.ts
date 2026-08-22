import { renderHook, act } from "@testing-library/react";
import { useAdaptivePolling, computeAdaptiveDelay } from "./useAdaptivePolling";
import { ApiError } from "@/lib/api";
import { setToken } from "@/lib/auth";

interface StatusResult {
  status: "processing" | "completed" | "failed";
}

const isTerminal = (r: StatusResult) =>
  r.status === "completed" || r.status === "failed";

function flush() {
  return act(async () => {
    await Promise.resolve();
  });
}

function advance(ms: number) {
  return act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe("computeAdaptiveDelay", () => {
  it("sigue la secuencia de backoff 3s, 5s, 8s, 12s y se fija en 15s", () => {
    expect(computeAdaptiveDelay(0)).toBe(3000);
    expect(computeAdaptiveDelay(1)).toBe(5000);
    expect(computeAdaptiveDelay(2)).toBe(8000);
    expect(computeAdaptiveDelay(3)).toBe(12000);
    expect(computeAdaptiveDelay(4)).toBe(15000);
    expect(computeAdaptiveDelay(10)).toBe(15000);
  });

  it("respeta un maxIntervalMs personalizado", () => {
    expect(computeAdaptiveDelay(5, 20000)).toBe(20000);
  });
});

describe("useAdaptivePolling", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    setToken("jwt-test");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("detiene el polling y llama a onTerminal cuando la tarea termina", async () => {
    const onTerminal = jest.fn();
    const onTimeout = jest.fn();
    const onUnauthorized = jest.fn();
    const fetchStatus = jest.fn().mockResolvedValue({ status: "completed" });

    const { result } = renderHook(() =>
      useAdaptivePolling<StatusResult>({
        fetchStatus,
        isTerminal,
        onTerminal,
        onTimeout,
        onUnauthorized,
      }),
    );

    act(() => result.current.start());
    await flush();

    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledWith({ status: "completed" });
    expect(onTimeout).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(result.current.isPolling).toBe(false);
  });

  it("aplica backoff exponencial (3s, 5s, 8s, 12s) mientras sigue procesando", async () => {
    const fetchStatus = jest
      .fn()
      .mockResolvedValue({ status: "processing" });

    const { result } = renderHook(() =>
      useAdaptivePolling<StatusResult>({
        fetchStatus,
        isTerminal,
      }),
    );

    act(() => result.current.start());

    // Primera consulta tras el intervalo inicial de 3s.
    await advance(3000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(result.current.isPolling).toBe(true);

    // Segunda consulta 5s después.
    await advance(5000);
    expect(fetchStatus).toHaveBeenCalledTimes(2);

    // Tercera consulta 8s después.
    await advance(8000);
    expect(fetchStatus).toHaveBeenCalledTimes(3);

    // Cuarta consulta 12s después.
    await advance(12000);
    expect(fetchStatus).toHaveBeenCalledTimes(4);

    act(() => result.current.stop());
  });

  it("interrumpe de inmediato y llama a onUnauthorized en un error 401", async () => {
    const onUnauthorized = jest.fn();
    const onTerminal = jest.fn();
    const fetchStatus = jest
      .fn()
      .mockRejectedValue(new ApiError(401, "Token expirado"));

    const { result } = renderHook(() =>
      useAdaptivePolling<StatusResult>({
        fetchStatus,
        isTerminal,
        onUnauthorized,
        onTerminal,
      }),
    );

    act(() => result.current.start());
    await advance(3000);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onTerminal).not.toHaveBeenCalled();
    expect(result.current.isPolling).toBe(false);

    // No debe haber más reintentos tras la interrupción.
    const callsAfter = fetchStatus.mock.calls.length;
    await advance(60000);
    expect(fetchStatus).toHaveBeenCalledTimes(callsAfter);
  });

  it("llama a onTimeout al alcanzar el máximo de reintentos", async () => {
    const onTimeout = jest.fn();
    const fetchStatus = jest
      .fn()
      .mockResolvedValue({ status: "processing" });

    const { result } = renderHook(() =>
      useAdaptivePolling<StatusResult>({
        fetchStatus,
        isTerminal,
        onTimeout,
        options: { maxAttempts: 3 },
      }),
    );

    act(() => result.current.start());
    // 3 intentos: 3s + 5s + 8s = 16s.
    await advance(3000);
    await advance(5000);
    await advance(8000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.isPolling).toBe(false);
  });

  it("detiene el polling cuando no hay token de sesión", async () => {
    const onUnauthorized = jest.fn();
    localStorage.clear(); // sin sesión
    const fetchStatus = jest
      .fn()
      .mockResolvedValue({ status: "processing" });

    const { result } = renderHook(() =>
      useAdaptivePolling<StatusResult>({
        fetchStatus,
        isTerminal,
        onUnauthorized,
      }),
    );

    act(() => result.current.start());
    await advance(3000);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchStatus).not.toHaveBeenCalled();
    expect(result.current.isPolling).toBe(false);
  });
});
