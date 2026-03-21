export function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Replaces placeholders in a template string with provided values.
 * Placeholders should be in the format {{key}}.
 * 
 * @param template The template string containing {{key}} placeholders.
 * @param variables A record of key-value pairs to replace in the template.
 * @returns The rendered string with all placeholders replaced.
 */
export function renderHtml(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    // Replace all occurrences of {{key}} with the value
    const placeholder = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(placeholder, value);
  }
  return rendered;
}
