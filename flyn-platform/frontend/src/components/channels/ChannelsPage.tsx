import { useState, useEffect } from 'react';
import { ChannelList } from './ChannelList';
import { ChannelConnectModal } from './ChannelConnectModal';
import { ChannelType, ChannelConfig } from './channel.types';
import { ChannelService } from '../../services/channel.service';

// tenantId prop kept for API compatibility but no longer forwarded to ChannelService —
// the backend derives the tenant from the JWT so we don't risk stale-localStorage mismatches.
interface ChannelsPageProps {
  tenantId?: string;
}

export function ChannelsPage({ tenantId: _tenantId }: ChannelsPageProps) {
  const [channels, setChannels] = useState<ReturnType<typeof ChannelService.listChannels> extends Promise<infer T> ? T : never>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    try {
      setIsLoading(true);
      const data = await ChannelService.listChannels();
      setChannels(data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setError(msg || 'Failed to load channels');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (type: ChannelType, config: ChannelConfig) => {
    const result = await ChannelService.connectChannel(type, config);

    if (!result.success) {
      throw new Error(result.error || 'Failed to connect channel');
    }

    await loadChannels();
  };

  const handleTest = async (type: ChannelType, config: ChannelConfig): Promise<boolean> => {
    const result = await ChannelService.testConnection(_tenantId ?? '', type, config);
    return result.success;
  };

  const handleDisconnect = async (channelId: string) => {
    const success = await ChannelService.disconnectChannel(channelId);

    if (success) {
      await loadChannels();
    } else {
      throw new Error('Failed to disconnect channel');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Channels</h1>
          <p className="text-gray-600 mt-1">
            Connect messaging platforms to your unified inbox
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Connect Channel</span>
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p>{error}</p>
            <button className="text-sm underline mt-1" onClick={loadChannels}>Try again</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading channels...</p>
        </div>
      ) : (
        <ChannelList
          channels={channels}
          onDisconnect={handleDisconnect}
          isLoading={isLoading}
        />
      )}

      <ChannelConnectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConnect={handleConnect}
        onTest={handleTest}
        tenantId={_tenantId ?? ''}
      />
    </div>
  );
}
