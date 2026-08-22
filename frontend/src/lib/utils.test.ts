import { cn } from "./utils";

describe("cn", () => {
  it("combina clases simples", () => {
    expect(cn("px-2", "py-3")).toBe("px-2 py-3");
  });

  it("ignora valores falsy", () => {
    expect(cn("px-2", false && "hidden", null, undefined, 0, "py-3")).toBe("px-2 py-3");
  });

  it("mezcla clases condicionales", () => {
    expect(cn("text-sm", true && "font-bold", false && "italic")).toBe(
      "text-sm font-bold",
    );
  });

  it("resuelve conflictos de tailwind-merge (última gana)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("acepta objetos clsx", () => {
    expect(cn({ "px-2": true, hidden: false })).toBe("px-2");
  });
});
