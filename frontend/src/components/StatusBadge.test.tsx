import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  AgentStatusBadge,
  AgentStatusDot,
  ConversationStatusBadge,
} from "./StatusBadge";

describe("AgentStatusBadge", () => {
  it("renders Spanish labels for agent states", () => {
    render(<AgentStatusBadge status="ONLINE" />);
    expect(screen.getByText("En línea")).toBeInTheDocument();
  });

  it("renders break status", () => {
    render(<AgentStatusBadge status="ON_BREAK" />);
    expect(screen.getByText("En descanso")).toBeInTheDocument();
  });
});

describe("AgentStatusDot", () => {
  it("renders status indicator element", () => {
    const { container } = render(<AgentStatusDot status="BUSY" />);
    expect(container.querySelector("span.rounded-full")).toBeTruthy();
  });
});

describe("ConversationStatusBadge", () => {
  it("renders queue and resolved states used in inbox", () => {
    const { rerender } = render(<ConversationStatusBadge status="WAITING" />);
    expect(screen.getByText("En cola")).toBeInTheDocument();

    rerender(<ConversationStatusBadge status="RESOLVED" />);
    expect(screen.getByText("Resuelta")).toBeInTheDocument();
  });

  it("renders active and wrap-up states", () => {
    const { rerender } = render(<ConversationStatusBadge status="ACTIVE" />);
    expect(screen.getByText("Activa")).toBeInTheDocument();

    rerender(<ConversationStatusBadge status="WRAP_UP" />);
    expect(screen.getByText("Cierre")).toBeInTheDocument();
  });
});
