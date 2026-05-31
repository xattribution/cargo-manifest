<script lang="ts">
  // Pick Up (left) and Drop Off (right), side by side with a divider between.
  // Pick-up checks are a visual collected-reminder; drop-off checks are the real completion.
  import GroupSection from './GroupSection.svelte';
</script>

<section class="zone">
  <div class="routes">
    <div class="route-col" style="--accent:var(--violet)">
      <div class="route-head">
        <span class="zone-num">4</span>
        <h2 class="zone-title">Pick Up</h2>
        <span class="zone-hint">one card per source · check = “I’ve collected this” (visual only)</span>
      </div>
      <GroupSection field="source" cls="src" mode="pickup" labelField="commodity" otherField="destination" otherPrefix="to" />
    </div>

    <div class="route-divider" aria-hidden="true"></div>

    <div class="route-col" style="--accent:var(--orange)">
      <div class="route-head">
        <span class="zone-num">5</span>
        <h2 class="zone-title">Drop Off</h2>
        <span class="zone-hint">one card per destination · check = delivered (completes the line)</span>
      </div>
      <GroupSection field="destination" cls="dest" mode="dropoff" labelField="commodity" otherField="source" otherPrefix="from" />
    </div>
  </div>
</section>
