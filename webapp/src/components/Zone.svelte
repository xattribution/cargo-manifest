<script lang="ts">
  // A distinct, accent-themed section band. Gives each major area its own colour, number,
  // and clear separation so the page reads as discrete zones instead of one blue wall.
  import type { Snippet } from 'svelte';

  let {
    accent = 'var(--cyan)',
    num = null,
    title,
    hint = '',
    collapsible = false,
    open = true,
    onToggle = () => {},
    actions,
    children,
  }: {
    accent?: string;
    num?: number | null;
    title: string;
    hint?: string;
    collapsible?: boolean;
    open?: boolean;
    onToggle?: () => void;
    actions?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="zone" style="--accent:{accent}">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="zone-head"
    class:collapse-head={collapsible}
    class:collapsed={collapsible && !open}
    role={collapsible ? 'button' : undefined}
    tabindex={collapsible ? 0 : undefined}
    onclick={collapsible ? onToggle : undefined}
    onkeydown={collapsible ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } } : undefined}
  >
    {#if num != null}<span class="zone-num">{num}</span>{/if}
    <h2 class="zone-title">{title}</h2>
    {#if hint}<span class="zone-hint">{hint}</span>{/if}
    {#if actions}
      <span class="zone-actions" role="presentation" onclick={(e) => e.stopPropagation()}>{@render actions()}</span>
    {/if}
    {#if collapsible}<span class="caret">▾</span>{/if}
  </div>
  {#if !collapsible || open}
    <div class="zone-body">{@render children()}</div>
  {/if}
</section>
