'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { mcpApi } from '@/lib/api/mcp.api';
import type { McpServerSummary } from '@/lib/types/mcp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  agentId: string;
};

/** Inline "🔌 Tools" section of the agent inspector — always visible, not tucked in a modal. */
export function McpToolsPanel({ agentId }: Props) {
  const t = useTranslations('mcp');
  const qc = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authType, setAuthType] = useState<'none' | 'bearer'>('none');
  const [bearerToken, setBearerToken] = useState('');

  const { data: servers = [] } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: async () => {
      const res = await mcpApi.list();
      if (!res.success) throw new Error(res.error?.message);
      return res.data || [];
    },
  });

  const { data: attached = [] } = useQuery({
    queryKey: ['agent-mcp-servers', agentId],
    queryFn: async () => {
      const res = await mcpApi.listForAgent(agentId);
      if (!res.success) throw new Error(res.error?.message);
      return res.data || [];
    },
  });

  const attachedIds = new Set(attached.map((s) => s.id));

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !url.trim()) throw new Error(t('missingFields'));
      const res = await mcpApi.create({
        name: name.trim(),
        url: url.trim(),
        auth_type: authType,
        bearer_token: authType === 'bearer' ? bearerToken.trim() : undefined,
      });
      if (!res.success || !res.data) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('serverCreated'));
      qc.invalidateQueries({ queryKey: ['mcp-servers'] });
      setName('');
      setUrl('');
      setAuthType('none');
      setBearerToken('');
      setShowAddForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await mcpApi.remove(id);
      if (!res.success) throw new Error(res.error?.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-servers'] });
      qc.invalidateQueries({ queryKey: ['agent-mcp-servers', agentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ server, attach }: { server: McpServerSummary; attach: boolean }) => {
      const res = attach
        ? await mcpApi.attachToAgent(agentId, server.id)
        : await mcpApi.detachFromAgent(agentId, server.id);
      if (!res.success) throw new Error(res.error?.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-mcp-servers', agentId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">🔌 {t('title')}</p>
        <Button variant="ghost" size="sm" onClick={() => setShowAddForm((v) => !v)}>
          + {t('addServer')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('subtitle')}</p>

      <div className="space-y-2">
        {servers.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noServers')}</p>
        ) : (
          servers.map((server) => (
            <div
              key={server.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{server.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{server.url}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Switch
                  checked={attachedIds.has(server.id)}
                  onCheckedChange={(checked) => toggleMut.mutate({ server, attach: checked })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => deleteMut.mutate(server.id)}
                  disabled={deleteMut.isPending}
                >
                  {t('delete')}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {showAddForm ? (
        <div className="grid gap-2.5 rounded-lg border border-border p-3">
          <div className="space-y-1">
            <Label className="text-xs">{t('serverName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('serverNamePlaceholder')}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('serverUrl')}</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs">{t('authType')}</Label>
              <Select value={authType} onValueChange={(v) => setAuthType(v as 'none' | 'bearer')}>
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('authNone')}</SelectItem>
                  <SelectItem value="bearer">{t('authBearer')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {authType === 'bearer' ? (
              <div className="space-y-1">
                <Label className="text-xs">{t('bearerToken')}</Label>
                <Input
                  type="password"
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending ? t('creating') : t('addServer')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
