/**
 * Renders recent channel shortcut buttons.
 */
export function renderRecentChannels(
  channels: readonly string[],
  onChannelSelected: (channel: string) => void,
): void {
  const container = document.querySelector<HTMLDivElement>(
    '#recentChannelsContainer',
  );

  if (!container) {
    return;
  }

  container.replaceChildren();

  for (const channel of channels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tmc-channel-button';
    button.textContent = `#${channel}`;
    button.addEventListener('click', () => onChannelSelected(channel));

    container.appendChild(button);
  }
}
