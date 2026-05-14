import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavBar } from "./NavBar";

describe("<NavBar />", () => {
  it("renders the brand prop content", () => {
    render(<NavBar brand="Livinity" />);
    expect(screen.getByText("Livinity")).toBeInTheDocument();
  });

  it("renders the actions slot when provided", () => {
    render(
      <NavBar
        brand="Livinity"
        actions={<button type="button">sign in</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "sign in" }),
    ).toBeInTheDocument();
  });

  it("renders as a <header> landmark by default (and <nav> via the `as` prop)", () => {
    const { container, rerender } = render(<NavBar brand="Livinity" />);
    expect(container.querySelector("header")).toBeTruthy();
    rerender(<NavBar brand="Livinity" as="nav" />);
    expect(container.querySelector("nav")).toBeTruthy();
  });

  it("applies the .navbar class", () => {
    const { container } = render(<NavBar brand="Livinity" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.classList.contains("navbar")).toBe(true);
  });

  it("passes through extra className via cn()", () => {
    const { container } = render(
      <NavBar brand="Livinity" className="custom-cls" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.classList.contains("navbar")).toBe(true);
    expect(root.classList.contains("custom-cls")).toBe(true);
  });
});
