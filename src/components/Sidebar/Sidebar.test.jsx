import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";

function render(ui, options) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>, options);
}

vi.mock("../../services/tauriBridge", async () => {
  const { makeBridgeMock } = await import("../../test/bridgeMock");
  return makeBridgeMock();
});

import * as bridge from "../../services/tauriBridge";
import { setStore, CLEAN_STATUS } from "../../test/helpers";
import Sidebar from "./Sidebar";
import { useRepoStore } from "../../store/repoStore";

function stubRun() {
  useRepoStore.setState({
    run: vi.fn(async (operation) => {
      await operation("/repo");
      return true;
    }),
  });
}

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStore();
    stubRun();
  });

  it("renders nothing when no repository is open", () => {
    setStore({ repo: null });
    const { container } = render(<Sidebar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the open repository, with its full path available on hover", () => {
    render(<Sidebar />);
    expect(screen.getByTitle("/repo")).toHaveTextContent("repo");
  });



  describe("remotes list", () => {
    it("stays collapsed until asked for", () => {
      setStore({
        remotes: [
          {
            name: "origin",
            fetchUrl: "git@example.invalid:me/repo.git",
            pushUrl: "git@example.invalid:me/repo.git",
          },
        ],
      });
      stubRun();

      render(<Sidebar />);
      expect(screen.queryByText("origin")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText(/remotes \(1\)/i));
      expect(screen.getByText("origin")).toBeInTheDocument();
    });

    it("reports having no remotes", () => {
      render(<Sidebar />);
      fireEvent.click(screen.getByText(/remotes \(0\)/i));

      expect(screen.getByText(/no remotes/i)).toBeInTheDocument();
    });
  });
});
