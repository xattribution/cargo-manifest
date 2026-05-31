<script lang="ts">
  // Text input + optional datalist autocomplete + optional novelty "+" (adds to catalog).
  // Works both bound (bind:value) and one-way (value= + oninput callback).
  import { catalog } from '../stores/catalog.svelte';
  import { isNovel } from '../lib/catalog';
  import type { Cat } from '../lib/types';

  let {
    value = $bindable(''),
    placeholder = '',
    list = undefined,
    cls = '',
    cat = undefined,
    dataF = undefined,
    inputmode = undefined,
    oninput = undefined,
    onkeydown = undefined,
  }: {
    value?: string;
    placeholder?: string;
    list?: string;
    cls?: string;
    cat?: Cat;
    dataF?: string;
    inputmode?: 'numeric' | 'text';
    oninput?: (v: string) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  } = $props();

  // Only commodities/locations support inline "+"; ships are added via the fleet's Add row.
  const novel = $derived(cat === 'commodities' || cat === 'locations' ? isNovel(catalog.catOf(cat), value) : false);

  function add() {
    if (cat) catalog.addTo(cat, value);
  }
</script>

<span class="field">
  <input
    class={'cell ' + cls + (novel ? ' has-add' : '')}
    type="text"
    {placeholder}
    {list}
    inputmode={inputmode}
    data-f={dataF}
    bind:value
    oninput={() => oninput?.(value)}
    onkeydown={(e) => onkeydown?.(e)}
  />
  {#if cat === 'commodities' || cat === 'locations'}
    <button class="addbtn" hidden={!novel} title="Add to catalog" type="button" onclick={add}>+</button>
  {/if}
</span>
