<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal" class:wide role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <div class="modal-head">
      <h3>{title}</h3>
      <button class="modal-x" title="Close" aria-label="Close" onclick={onClose}>✕</button>
    </div>
    <div class="modal-body">{@render children()}</div>
  </div>
</div>
