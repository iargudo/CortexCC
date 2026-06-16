import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChannelBadge, ChannelIcon } from "./ChannelIcon";

describe("ChannelIcon", () => {
  it("renders icon for each supported channel", () => {
    const { container, rerender } = render(<ChannelIcon channel="WHATSAPP" />);
    expect(container.querySelector("svg")).toBeTruthy();

    rerender(<ChannelIcon channel="VOICE" size={24} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

describe("ChannelBadge", () => {
  it("shows localized channel label", () => {
    render(<ChannelBadge channel="EMAIL" />);
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("shows voice label for phone channel", () => {
    render(<ChannelBadge channel="VOICE" />);
    expect(screen.getByText("Voz")).toBeInTheDocument();
  });
});
