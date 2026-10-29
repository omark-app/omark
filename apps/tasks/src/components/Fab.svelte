<script lang="ts">
  let { onclick }: { onclick: () => void } = $props();
</script>

<button class="fab" data-testid="fab" aria-label="Add a task" {onclick}>+</button>

<style>
  .fab { display: grid; place-items: center; position: fixed; z-index: 30; right: calc(16px + env(safe-area-inset-right, 0px)); bottom: calc(70px + var(--part-tabs, 0px) + env(safe-area-inset-bottom, 0px)); width: 56px; height: 56px; border-radius: 50%; border: 0; background: var(--accent); color: var(--on-accent); font: 400 30px/1 var(--sans); box-shadow: var(--shadow); cursor: pointer; }
</style>
