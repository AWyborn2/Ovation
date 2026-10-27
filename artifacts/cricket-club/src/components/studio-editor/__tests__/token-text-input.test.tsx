/**
 * Social Studio: the text box searches the card's live fields ("hashtag",
 * "team name", `{{`) and puts the picked field's `{{token}}` in place.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { tokenQuery, TokenTextInput, type TokenField } from "../token-text-input";
import { EditorToolbar } from "../toolbar";

afterEach(() => cleanup());

const FIELDS: TokenField[] = [
  { key: "gradeHeading", label: "Grade heading" },
  { key: "teamName", label: "Team name" },
  { key: "hashtag", label: "Hashtag" },
  { key: "opposition.name", label: "Opposition name" },
];

function Box({ initial = "", onText }: { initial?: string; onText?: (t: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <TokenTextInput
      value={text}
      fields={FIELDS}
      onChange={(t) => {
        setText(t);
        onText?.(t);
      }}
    />
  );
}

/** Types `text` as the box's whole content, caret at the end (or at `caret`). */
function type(text: string, caret = text.length) {
  const input = screen.getByRole("combobox") as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  input.setSelectionRange(caret, caret);
  fireEvent.select(input);
  return input;
}

const options = () => screen.queryAllByRole("option").map((o) => o.textContent);

describe("tokenQuery", () => {
  it("matches label or key, ignoring case and spaces", () => {
    expect(tokenQuery("team name", 9, FIELDS)?.matches[0].key).toBe("teamName");
    expect(tokenQuery("TEAMNAME", 8, FIELDS)?.matches[0].key).toBe("teamName");
    expect(tokenQuery("oppos", 5, FIELDS)?.matches[0].key).toBe("opposition.name");
  });

  it("searches the longest run of words before the caret that matches", () => {
    expect(tokenQuery("Go team na", 10, FIELDS)).toMatchObject({ start: 3, end: 10 });
  });

  it("lists every field after an open {{ and spans the rest of that token", () => {
    expect(tokenQuery("{{", 2, FIELDS)?.matches).toHaveLength(4);
    expect(tokenQuery("x {{tea}} y", 6, FIELDS)).toMatchObject({ start: 2, end: 9 });
  });

  it("stays quiet for one letter, a finished word, or text that matches nothing", () => {
    expect(tokenQuery("h", 1, FIELDS)).toBeNull();
    expect(tokenQuery("hashtag ", 8, FIELDS)).toBeNull();
    expect(tokenQuery("zzz", 3, FIELDS)).toBeNull();
    expect(tokenQuery("{{hashtag}}", 11, FIELDS)).toBeNull();
  });
});

describe("TokenTextInput", () => {
  it("searches fields by a plain word and shows their labels", () => {
    render(<Box />);
    type("hash");
    expect(screen.getByRole("listbox", { name: "Fields" })).toBeTruthy();
    expect(options()).toEqual(["Hashtag{{hashtag}}"]);
    expect(screen.getByRole("combobox").getAttribute("aria-expanded")).toBe("true");
  });

  it("replaces the words being typed with the picked field's token", () => {
    let last = "";
    render(<Box onText={(t) => (last = t)} />);
    const input = type("Go team na");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(last).toBe("Go {{teamName}}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens on {{ and inserts at the caret beside an existing token", () => {
    let last = "";
    render(<Box initial="{{hashtag}} " onText={(t) => (last = t)} />);
    const input = type("{{hashtag}} {{");
    expect(options()).toHaveLength(4);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(last).toBe("{{hashtag}} {{teamName}}");
  });

  it("replaces a half-typed token in the middle of the text", () => {
    let last = "";
    render(<Box onText={(t) => (last = t)} />);
    type("Round {{gra}} today", 10);
    fireEvent.click(screen.getByRole("option", { name: /Grade heading/ }));
    expect(last).toBe("Round {{gradeHeading}} today");
  });

  it("closes on Escape without changing the text", () => {
    let last = "";
    render(<Box onText={(t) => (last = t)} />);
    const input = type("hashtag");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(last).toBe("hashtag");
  });
});

describe("toolbar text box", () => {
  const props = {
    isGroup: false,
    onColour: () => {},
    onLock: () => {},
    onDuplicate: () => {},
    onDelete: () => {},
    onGroup: () => {},
    onUngroup: () => {},
  };

  it("searches fields for a text layer when the page passes them", () => {
    function Bar() {
      const [content, setContent] = useState("");
      return (
        <EditorToolbar
          {...props}
          selected={[{ id: "a", kind: "text", content, geometry: {} }]}
          onText={setContent}
          fields={FIELDS}
        />
      );
    }
    render(<Bar />);
    const input = type("{{");
    expect(input.getAttribute("aria-label")).toBe("Text");
    expect(screen.getAllByRole("option")).toHaveLength(4);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("{{gradeHeading}}");
  });

  it("stays a plain text box without fields", () => {
    render(
      <EditorToolbar
        {...props}
        selected={[{ id: "a", kind: "text", content: "Hi", geometry: {} }]}
        onText={() => {}}
      />,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByLabelText("Text")).toBeTruthy();
  });
});
