import "@testing-library/jest-dom";

// Mock de next/link: en jsdom no hay router de Next montado, así que
// renderizamos un simple <a href>. Se descartan props internas de Next
// (passHref, legacyBehavior, prefetch) que React no debe renderizar en el DOM.
jest.mock("next/link", () => {
  const React = require("react");
  const MockLink = ({ href, children, passHref, legacyBehavior, prefetch, scroll, shallow, ...props }: any) =>
    React.createElement("a", { href, ...props }, children);
  MockLink.displayName = "MockLink";
  return MockLink;
});

// Mock global de next/navigation (useRouter/usePathname/useSearchParams).
// Los tests que necesiten inspeccionar el router lo sobrescriben a nivel de archivo.
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// matchMedia no existe en jsdom; lo necesitan librerías como next-themes.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// jsdom no implementa la reproducción de audio. Se silencia HTMLMediaElement.play
// (usado por useChessSounds) para evitar el ruido "Not implemented" en los tests.
if (typeof window !== "undefined" && typeof HTMLMediaElement !== "undefined") {
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: jest.fn().mockResolvedValue(undefined),
  });
}
