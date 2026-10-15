// Reads a positive integer setting from the environment.
export function envInt (name, fallback) {
  const value = Number.parseInt(process.env[name], 10)
  return Number.isInteger(value) && value > 0 ? value : fallback
}
