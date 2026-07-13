/**
 * Renders recent channel shortcut buttons.
 */
export function renderRecentChannels(
  channels: readonly string[],
  onChannelSelected: (channel: string) => void,
): void {
  renderChannelButtons(
    '#recentChannelsContainer, [data-tmc-recent-channels]',
    channels,
    onChannelSelected,
  );
}

/**
 * Renders favorite channel shortcut buttons.
 */
export function renderFavoriteChannels(
  channels: readonly string[],
  onChannelSelected: (channel: string) => void,
): void {
  renderChannelButtons(
    '#favoriteChannelsContainer, [data-tmc-favorite-channels]',
    channels,
    onChannelSelected,
  );
}

function renderChannelButtons(
  containerSelector: string,
  channels: readonly string[],
  onChannelSelected: (channel: string) => void,
): void {
  const container = document.querySelector<HTMLDivElement>(containerSelector);

  if (!container) {
    return;
  }

  container.replaceChildren();

  for (const channel of channels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tmc-channel-button';
    button.dataset.channel = channel;
    button.textContent = `#${channel}`;
    button.addEventListener('click', () => onChannelSelected(channel));

    container.appendChild(button);
  }
}



