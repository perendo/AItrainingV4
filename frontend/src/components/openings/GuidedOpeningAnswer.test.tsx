import { render, screen, fireEvent } from "@testing-library/react";
import { GuidedOpeningAnswer } from "./GuidedOpeningAnswer";

jest.mock("react-markdown", () => {
  const MockMarkdown = (props: { children?: string }) => (
    <div data-testid="markdown">{String(props.children || "")}</div>
  );
  MockMarkdown.displayName = "MockMarkdown";
  return MockMarkdown;
});

describe("GuidedOpeningAnswer", () => {
  const baseProps = {
    deviationMove: "d4",
    consultationStatus: "processing" as const,
    consultationAnswer: null,
    value: "",
    onChange: jest.fn(),
    onSubmit: jest.fn(),
  };

  it("muestra el campo de contestación y el botón de envío", () => {
    render(<GuidedOpeningAnswer {...baseProps} />);
    expect(
      screen.getByLabelText("Tu contestación"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Enviar mi contestación al Gran Maestro/i }),
    ).toBeInTheDocument();
  });

  it("muestra el estado de procesamiento de la consulta al GM", () => {
    render(<GuidedOpeningAnswer {...baseProps} consultationStatus="processing" />);
    expect(
      screen.getByText(/El Gran Maestro está analizando la posición/i),
    ).toBeInTheDocument();
  });

  it("muestra la contestación del GM cuando la consulta termina", () => {
    render(
      <GuidedOpeningAnswer
        {...baseProps}
        consultationStatus="completed"
        consultationAnswer="Con **d4** se controla el centro y se libera el alfil de casillas claras."
      />,
    );
    expect(
      screen.getByText("¿Qué se pretende con d4?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/se controla el centro/),
    ).toBeInTheDocument();
  });

  it("ofrece reintentar cuando la consulta al GM falla", () => {
    const onRetryConsultation = jest.fn();
    render(
      <GuidedOpeningAnswer
        {...baseProps}
        consultationStatus="failed"
        onRetryConsultation={onRetryConsultation}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Reintentar consulta/i }),
    );
    expect(onRetryConsultation).toHaveBeenCalled();
  });

  it("propaga el texto escrito en el textarea", () => {
    const onChange = jest.fn();
    render(<GuidedOpeningAnswer {...baseProps} onChange={onChange} />);
    const textarea = screen.getByLabelText("Tu contestación");
    fireEvent.change(textarea, { target: { value: "Quería controlar el centro" } });
    expect(onChange).toHaveBeenCalledWith("Quería controlar el centro");
  });

  it("envía la contestación al pulsar el botón", () => {
    const onSubmit = jest.fn();
    render(<GuidedOpeningAnswer {...baseProps} onSubmit={onSubmit} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Enviar mi contestación al Gran Maestro/i }),
    );
    expect(onSubmit).toHaveBeenCalled();
  });

  it("evita jugadas manuales: sin jugada de desvío usa 'tu última jugada'", () => {
    render(
      <GuidedOpeningAnswer {...baseProps} deviationMove={null} consultationStatus="completed" />,
    );
    expect(
      screen.getByText("¿Cuál era la idea de tu última jugada?"),
    ).toBeInTheDocument();
  });
});