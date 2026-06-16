import { useState, useEffect } from 'react';
import { ChannelService } from '@/services/channel.service';
import { ChannelConnection } from '@/components/channels/channel.types';

let cachedChannels: ChannelConnection[] | null = null;
let fetchPromise: Promise<ChannelConnection[]> | null = null;

export function useWorkflowChannels() {
  const [channels, setChannels] = useState<ChannelConnection[]>(cachedChannels ?? []);
  const [loading, setLoading] = useState(!cachedChannels);

  useEffect(() => {
    if (cachedChannels) return;
    if (!fetchPromise) {
      fetchPromise = ChannelService.listChannels().catch(() => []);
    }
    setLoading(true);
    fetchPromise.then((data) => {
      cachedChannels = data;
      setChannels(data);
      setLoading(false);
    });
  }, []);

  return { channels, loading };
}
