<script lang="ts">
  export type RemoteLibraryFieldValues = {
    host?: string;
    port?: string | number;
    username?: string;
    walkConcurrency?: string | number;
    operationTimeoutMs?: string | number;
    root?: string;
    secure?: boolean;
  };

  let {
    protocol,
    values = {},
    passwordPlaceholder = "",
    rootPlaceholder = "/media",
  }: {
    protocol: "sftp" | "webdav";
    values?: RemoteLibraryFieldValues;
    passwordPlaceholder?: string;
    rootPlaceholder?: string;
  } = $props();

  const defaultPort = $derived(protocol === "sftp" ? "22" : "443");
  const hostPlaceholder = $derived(protocol === "sftp" ? "sftp.example.com" : "nas.example.com");
</script>

<div class="source-grid">
  <label>
    Host
    <input name="host" value={values.host ?? ""} placeholder={hostPlaceholder} />
  </label>
  <label>
    Port
    <input name="port" inputmode="numeric" value={values.port ?? defaultPort} placeholder={defaultPort} />
  </label>
  {#if protocol === "webdav"}
    <label class="wide check subdued">
      <input type="hidden" name="secure" value="0" />
      <input type="checkbox" name="secure" value="1" checked={values.secure !== false} />
      <span>Use HTTPS</span>
    </label>
  {/if}
  <label class="wide">
    Username
    <input name="username" value={values.username ?? ""} placeholder="mediauser" />
  </label>
  <label class="wide">
    Password
    <input name="password" value="" autocomplete="off" placeholder={passwordPlaceholder} />
  </label>
  <label>
    Walk concurrency
    <input name="walkConcurrency" type="number" min="1" max="32" value={values.walkConcurrency ?? 4} />
  </label>
  <label>
    Timeout ms
    <input
      name="operationTimeoutMs"
      type="number"
      min="5000"
      max="300000"
      step="1000"
      value={values.operationTimeoutMs ?? 30_000}
    />
  </label>
</div>
<label>
  Root path
  <input name="root" value={values.root ?? ""} placeholder={rootPlaceholder} autocomplete="off" />
</label>

<style>
  .source-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 6rem;
    gap: 0.75rem;
  }

  .source-grid .wide {
    grid-column: 1 / -1;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .check input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    min-height: 0;
    margin: 0;
    padding: 0;
    flex: 0 0 auto;
  }
</style>
