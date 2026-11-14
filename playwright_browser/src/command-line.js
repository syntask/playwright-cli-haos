const MAX_LINE_LENGTH = 8192;

/**
 * Split a CLI line into arguments without invoking a shell.
 * Supports single/double quotes and backslash escapes. Shell operators,
 * variables, globs, and command substitution are treated as literal text.
 */
export function splitCommandLine(line) {
  if (typeof line !== "string") throw new TypeError("command must be a string");
  if (line.length > MAX_LINE_LENGTH) throw new TypeError("command is too long");
  if (/[\0\r\n]/.test(line)) throw new TypeError("command cannot contain NUL or newlines");

  const tokens = [];
  let current = "";
  let started = false;
  let quote = null;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quote === "'") {
      if (character === "'") quote = null;
      else current += character;
      continue;
    }

    if (quote === '"') {
      if (character === '"') {
        quote = null;
      } else if (character === "\\") {
        index += 1;
        if (index >= line.length) throw new TypeError("command ends with an escape");
        current += line[index];
        started = true;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (character === "\\") {
      index += 1;
      if (index >= line.length) throw new TypeError("command ends with an escape");
      current += line[index];
      started = true;
    } else if (/\s/.test(character)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
    } else {
      current += character;
      started = true;
    }
  }

  if (quote) throw new TypeError("command has an unterminated quote");
  if (started) tokens.push(current);
  return tokens;
}

export function parseCommandLine(line) {
  const tokens = splitCommandLine(line);
  if (!tokens.length) throw new TypeError("command is empty");

  if (tokens[0] === "playwright-cli" || tokens[0].endsWith("/playwright-cli")) {
    tokens.shift();
  }
  if (!tokens.length) throw new TypeError("command must include a CLI command");
  if (tokens.length > 100) throw new TypeError("command has too many arguments");
  if (tokens.some((token) => token.length > 8192)) {
    throw new TypeError("command arguments must be at most 8192 characters each");
  }
  return tokens;
}

export { MAX_LINE_LENGTH };
