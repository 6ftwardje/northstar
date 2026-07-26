const VAGUE_TITLES = [
  /^werken aan\b/i,
  /^nadenken over\b/i,
  /^bekijken\b/i,
  /^regelen\b/i,
  /^project\b/i,
  /^todo\b/i,
];

export function isConcreteTodoTitle(title: string) {
  const words = title.trim().split(/\s+/);
  return (
    words.length >= 2 &&
    /^[\p{L}][\p{L}'-]{2,}$/u.test(words[0]) &&
    !VAGUE_TITLES.some((pattern) => pattern.test(title))
  );
}
