let counter = 0
export function uid(prefix = ''): string {
  counter = (counter + 1) % 1e6
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${rand}`
}
