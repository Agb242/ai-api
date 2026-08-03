'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

type Props = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  userInitials?: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
};

export function ChatMessage({
  role,
  content,
  streaming,
  userInitials = 'U',
  promptTokens,
  completionTokens,
}: Props) {
  const isUser = role === 'user';
  const showUsage =
    !isUser && !streaming && (promptTokens != null || completionTokens != null);

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <Avatar size="sm" className="mt-0.5 shrink-0">
        <AvatarFallback className="text-[10px] font-semibold">
          {isUser ? userInitials : 'AI'}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col gap-1">
        <div
          className={cn(
            'max-w-[min(100%,640px)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
            isUser ? 'bg-[#FF6B35] text-white' : 'border border-border bg-card text-foreground',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:text-xs prose-code:before:content-none prose-code:after:content-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {content || (streaming ? '…' : '')}
              </ReactMarkdown>
              {streaming ? (
                <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-foreground/60 align-middle" />
              ) : null}
            </div>
          )}
        </div>
        {showUsage ? (
          <p className="px-1 font-mono text-[11px] text-muted-foreground">
            In {(promptTokens ?? 0).toLocaleString()} · Out {(completionTokens ?? 0).toLocaleString()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
