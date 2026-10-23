export type TextTool = "bold" | "italic" | "bullets" | "numbers";
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const styles = {
  bold: new Map<string, string>(),
  italic: new Map<string, string>(),
};
const plain = new Map<string, string>();
for (let i = 0; i < letters.length; i++) {
  const letter = letters[i]!;
  const bold = String.fromCodePoint((i < 26 ? 0x1d400 : 0x1d41a) + (i % 26));
  const italic =
    letter === "h"
      ? "ℎ"
      : String.fromCodePoint((i < 26 ? 0x1d434 : 0x1d44e) + (i % 26));
  styles.bold.set(letter, bold);
  styles.italic.set(letter, italic);
  plain.set(bold, letter);
  plain.set(italic, letter);
}
/** Visible text changes only. No HTML/Markdown is silently sent to Facebook. */
export function transformPostText(
  text: string,
  start: number,
  end: number,
  tool: TextTool,
) {
  start = Math.max(0, Math.min(text.length, start));
  end = Math.max(start, Math.min(text.length, end));
  if (tool === "bold" || tool === "italic") {
    if (start === end) return { text, start, end };
    const selected = text.slice(start, end);
    const styled = [...selected].filter(
      (c) => plain.has(c) || styles[tool].has(c),
    );
    const removeStyle =
      styled.length > 0 &&
      styled.every(
        (c) => plain.has(c) && styles[tool].get(plain.get(c)!) === c,
      );
    const replacement = [...selected]
      .map((c) => {
        const base = plain.get(c) ?? c;
        return removeStyle ? base : (styles[tool].get(base) ?? c);
      })
      .join("");
    return {
      text: text.slice(0, start) + replacement + text.slice(end),
      start,
      end: start + replacement.length,
    };
  }
  const first = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const after = text.indexOf("\n", end);
  const last = after < 0 ? text.length : after;
  const lines = text.slice(first, last).split("\n");
  const pattern = tool === "bullets" ? /^•\s/ : /^\d+\.\s/;
  const remove = lines
    .filter((line) => line.trim())
    .every((line) => pattern.test(line));
  let number = 0;
  const replacement = lines
    .map((line) => {
      if (!line.trim()) return line;
      return remove
        ? line.replace(pattern, "")
        : `${tool === "bullets" ? "•" : `${++number}.`} ${line}`;
    })
    .join("\n");
  return {
    text: text.slice(0, first) + replacement + text.slice(last),
    start: first,
    end: first + replacement.length,
  };
}
/** Preserves the user's complete offer; only an explicitly editable opening is added. */
export function preparePostVariation(
  text: string,
  openings: string,
  random = Math.random,
) {
  const options = openings
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!text.trim() || !options.length) return null;
  const opening =
    options[
      Math.min(
        options.length - 1,
        Math.floor(Math.max(0, random()) * options.length),
      )
    ]!;
  if (opening.length > 160) return null;
  const result = `${opening}\n\n${text}`;
  return result.length <= 10000 ? result : null;
}
