import { useState } from 'react';
import { ChannelConfig } from './channel.types';

interface TelegramFormProps {
  onSubmit: (config: ChannelConfig) => void;
  onTest: (config: ChannelConfig) => Promise<boolean>;
  isLoading: boolean;
}

export function TelegramConnectForm({ onSubmit, onTest, isLoading }: TelegramFormProps) {
  const [formData, setFormData] = useState({ name: 'Telegram Bot', botToken: '', chatId: '' });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name: formData.name, credentials: { telegramBotToken: formData.botToken, ...(formData.chatId.trim() ? { telegramChatId: formData.chatId.trim() } : {}) } });
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    const success = await onTest({ name: formData.name, credentials: { telegramBotToken: formData.botToken } });
    setTestResult({ success, message: success ? 'Bot token is valid!' : 'Invalid bot token. Get it from @BotFather.' });
    setIsTesting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Channel Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none"
          placeholder="Telegram Bot"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Bot Token <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          value={formData.botToken}
          onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none"
          placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxyz"
          required
        />
        <p className="text-xs text-muted-foreground mt-1">Get this from @BotFather on Telegram</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Channel / Group Chat ID <span className="text-muted-foreground">(optional — for Quick Post)</span>
        </label>
        <input
          type="text"
          value={formData.chatId}
          onChange={(e) => setFormData({ ...formData, chatId: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none"
          placeholder="@mychannel or -100XXXXXXXXXX"
        />
        <p className="text-xs text-muted-foreground mt-1">Add your bot as admin to the channel/group first. Get the ID from @userinfobot.</p>
      </div>

      <div className="bg-sky-500/10 p-3 rounded-lg text-xs text-sky-600 dark:text-sky-400">
        <p className="font-medium mb-1">Setup Instructions:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Open Telegram and search for @BotFather</li>
          <li>Send /newbot command</li>
          <li>Follow prompts to create your bot</li>
          <li>Copy the bot token and paste it here</li>
        </ol>
      </div>

      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          {testResult.message}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={isTesting || !formData.botToken}
          className="flex-1 px-4 py-2 border border-input text-foreground rounded-lg hover:bg-accent disabled:opacity-50 text-sm"
        >
          {isTesting ? 'Testing…' : 'Test Token'}
        </button>
        <button
          type="submit"
          disabled={isLoading || !formData.botToken}
          className="flex-1 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 text-sm"
        >
          {isLoading ? 'Connecting…' : 'Connect Telegram'}
        </button>
      </div>
    </form>
  );
}
