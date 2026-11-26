import type { ChatMessage } from '@dash-iso/shared';
import { renderMarkdown } from './markdown.js';

export interface ChatPanelOptions {
  /** Send text to Dash. Return false if it could not be sent (e.g. offline). */
  onSend: (text: string) => boolean;
  /** Called when the panel opens or closes. */
  onToggle?: (open: boolean) => void;
  /** Called when a reply becomes pending / arrives. */
  onPending?: (pending: boolean) => void;
}

/** True when the newest message is the user's, i.e. Dash has not replied yet. */
export function isPending(messages: readonly ChatMessage[]): boolean {
  return messages.length > 0 && messages[messages.length - 1]!.role === 'user';
}

/**
 * Advisor-style chat window (HTML overlay) for talking to Dash about every
 * project in the org. Replies are rendered as sanitised markdown; everything
 * else is plain text.
 */
export class ChatPanel {
  readonly el: HTMLElement;
  private readonly log: HTMLElement;
  private readonly typing: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly sendBtn: HTMLButtonElement;
  private messages: ChatMessage[] = [];
  private notes: ChatMessage[] = [];
  private pending = false;
  private noteSeq = 0;

  constructor(
    parent: HTMLElement,
    private readonly opts: ChatPanelOptions,
  ) {
    const el = (tag: string, cls?: string, text?: string) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    this.el = el('aside', 'chat-panel');
    this.el.hidden = true;

    const header = el('header');
    header.append(el('div', 'portrait', '🧑‍💼'));
    const title = el('div', 'title');
    title.append(
      el('h2', undefined, 'Project Manager'),
      el('small', undefined, 'Ask Dash about any project'),
    );
    const close = el('button', 'close', '×') as HTMLButtonElement;
    close.title = 'Close (Esc)';
    close.addEventListener('click', () => this.close());
    header.append(title, close);

    this.log = el('div', 'log');
    this.log.setAttribute('role', 'log');
    this.log.setAttribute('aria-live', 'polite');
    this.typing = el('div', 'msg assistant typing');
    this.typing.hidden = true;
    this.typing.setAttribute('aria-label', 'Dash is typing');
    this.typing.append(el('span'), el('span'), el('span'));

    const form = el('form', 'composer') as HTMLFormElement;
    this.input = el('input') as HTMLInputElement;
    this.input.type = 'text';
    this.input.placeholder = 'Ask about projects, goals, tasks…';
    this.input.autocomplete = 'off';
    this.input.maxLength = 4000;
    this.sendBtn = el('button', 'send', 'Send') as HTMLButtonElement;
    this.sendBtn.type = 'submit';
    form.append(this.input, this.sendBtn);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    // Keep keys (WASD, Q/E, …) from reaching the map controls while typing.
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close();
    });

    this.el.append(header, this.log, form);
    parent.appendChild(this.el);
    this.render();
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  get isPending(): boolean {
    return this.pending;
  }

  open(): void {
    this.el.hidden = false;
    this.opts.onToggle?.(true);
    this.scrollToEnd(true);
    this.input.focus();
  }

  close(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.opts.onToggle?.(false);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Replace the history with the server's (snapshot + chat.receive). */
  setMessages(messages: ChatMessage[]): void {
    this.messages = messages;
    const pending = isPending(messages);
    this.render();
    if (pending !== this.pending) {
      this.pending = pending;
      this.opts.onPending?.(pending);
    }
    this.updateComposer();
  }

  /** A local-only system line (e.g. "not connected"). */
  addNote(text: string): void {
    this.notes.push({
      id: `note${++this.noteSeq}`,
      role: 'system',
      text,
      timestamp: Date.now(),
    });
    this.render();
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (!text || this.pending) return;
    if (this.opts.onSend(text)) {
      this.input.value = '';
    } else {
      this.addNote('Not connected to the bridge, so Dash cannot hear you. Start it and reload.');
    }
  }

  private updateComposer(): void {
    this.sendBtn.disabled = this.pending;
    this.input.placeholder = this.pending
      ? 'Waiting for a reply…'
      : 'Ask about projects, goals, tasks…';
  }

  private scrollToEnd(force = false): void {
    const log = this.log;
    const nearEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    if (force || nearEnd) log.scrollTop = log.scrollHeight;
  }

  private render(): void {
    const all = [...this.messages, ...this.notes].sort((a, b) => a.timestamp - b.timestamp);
    const nodes: HTMLElement[] = [];
    if (all.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'empty';
      hint.textContent =
        'Hi! I keep an eye on every project in the org. Ask me what is blocked, what is next, or how a goal is going.';
      nodes.push(hint);
    }
    for (const m of all) {
      const div = document.createElement('div');
      div.className = `msg ${m.role}`;
      const body = document.createElement('div');
      body.className = 'body';
      if (m.role === 'assistant') body.innerHTML = renderMarkdown(m.text);
      else body.textContent = m.text;
      const time = document.createElement('time');
      time.textContent = new Date(m.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      div.append(body, time);
      nodes.push(div);
    }
    const stick = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 60;
    this.typing.hidden = !isPending(this.messages);
    this.log.replaceChildren(...nodes, this.typing);
    if (stick) this.log.scrollTop = this.log.scrollHeight;
  }
}
