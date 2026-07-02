export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Mirror PowerShell Get-Content line semantics: split on CR?LF, and a single trailing
// newline does not produce a final empty line.
export function splitContentLines(text: string): string[] {
  const stripped = stripBom(text);
  if (stripped === "") return [];
  const lines = stripped.split(/\r?\n/);
  if (/\n$/.test(stripped) && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}
