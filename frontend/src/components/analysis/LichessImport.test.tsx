import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LichessImport } from "./LichessImport";
import { fetchLichessGames, analyzeLichessGame } from "@/lib/lichess";
import type { LichessGamePreview } from "@/lib/lichess";
import type { TaskResponse } from "@/lib/types";

jest.mock("@/lib/lichess", () => ({
  fetchLichessGames: jest.fn(),
  analyzeLichessGame: jest.fn(),
  combinePgnStream: (games: { pgn: string }[]) =>
    games.map((g) => g.pgn.trim()).join("\n\n"),
}));

const mockedFetch = fetchLichessGames as jest.Mock;
const mockedAnalyze = analyzeLichessGame as jest.Mock;

const sampleGames: LichessGamePreview[] = [
  {
    pgn: '[Event "Rated Blitz game"]\n[White "TestUser"]\n[Black "RivalOne"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    white: "TestUser",
    black: "RivalOne",
    rival: "RivalOne",
    playerColor: "white",
    result: "Victoria",
    resultRaw: "1-0",
    date: "10 ene 2025",
    speed: "Blitz",
    event: "Rated Blitz game",
    timeControl: "180+0",
  },
];

describe("LichessImport", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedAnalyze.mockReset();
  });

  it("muestra un error si no se introduce ningún usuario", async () => {
    const user = userEvent.setup();
    render(<LichessImport />);
    await user.click(
      screen.getByRole("button", { name: /importar de lichess/i })
    );
    expect(
      await screen.findByText(/introduce el nombre de usuario de lichess/i)
    ).toBeInTheDocument();
  });

  it("descarga, guarda y analiza en segundo plano al importar", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValue(sampleGames);
    mockedAnalyze.mockResolvedValue({ id: 1, status: "completed" } as TaskResponse);

    render(<LichessImport />);
    await user.type(screen.getByLabelText(/usuario de lichess/i), "TestUser");
    await user.click(
      screen.getByRole("button", { name: /importar de lichess/i })
    );

    expect(await screen.findByText("RivalOne")).toBeInTheDocument();
    expect(screen.getByText("Victoria")).toBeInTheDocument();
    expect(screen.getByText("Blitz")).toBeInTheDocument();

    await waitFor(() =>
      expect(mockedAnalyze).toHaveBeenCalledWith(
        "TestUser",
        sampleGames[0].pgn.trim()
      )
    );
  });

  it("no analiza si el usuario no tiene partidas", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValue([] as LichessGamePreview[]);

    render(<LichessImport />);
    await user.type(screen.getByLabelText(/usuario de lichess/i), "TestUser");
    await user.click(
      screen.getByRole("button", { name: /importar de lichess/i })
    );

    expect(
      await screen.findByText(/no tiene partidas públicas recientes/i)
    ).toBeInTheDocument();
    expect(mockedAnalyze).not.toHaveBeenCalled();
  });

  it("muestra un mensaje descriptivo si el usuario de Lichess no existe", async () => {
    const user = userEvent.setup();
    mockedFetch.mockRejectedValue(
      new Error(
        'El usuario de Lichess "fantasma" no existe o no tiene partidas públicas.'
      )
    );

    render(<LichessImport />);
    await user.type(screen.getByLabelText(/usuario de lichess/i), "fantasma");
    await user.click(
      screen.getByRole("button", { name: /importar de lichess/i })
    );

    expect(
      await screen.findByText(/no existe o no tiene partidas/i)
    ).toBeInTheDocument();
  });
});
