<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { Activity, Clock3, Film, Library, LogOut, Settings, Tv, UserRound } from "@lucide/svelte";
  import type { Snippet } from "svelte";
  import type PlaybackModalComponent from "$lib/components/PlaybackModal.svelte";

  let {
    children,
    user
  }: {
    children: Snippet;
    user: { name?: string | null; email?: string | null; role?: string | null } | null;
  } = $props();

  let accountMenuOpen = $state(false);
  let accountMenu: HTMLDivElement | null = $state(null);
  let PlaybackModal: typeof PlaybackModalComponent | null = $state(null);
  let playbackModalLoading = $state(false);

  const primaryNav = $derived([
    { href: "/movies", label: "Movies", icon: Film },
    { href: "/shows", label: "Shows", icon: Tv },
    { href: "/continue", label: "Continue", icon: Clock3 }
  ]);
  const adminNav = $derived(
    user?.role === "admin"
      ? [
          { href: "/libraries", label: "Libraries", icon: Library },
          { href: "/jobs", label: "Jobs", icon: Activity },
          { href: "/settings", label: "Settings", icon: Settings }
        ]
      : []
  );
  const desktopAdminNav = $derived(adminNav.filter((item) => item.href === "/libraries" || item.href === "/jobs"));
  const playbackRequested = $derived(Boolean(page.url.searchParams.get("play")?.trim()));

  function closeAccountMenu() {
    accountMenuOpen = false;
  }

  $effect(() => {
    if (!accountMenuOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!accountMenu?.contains(event.target as Node)) {
        accountMenuOpen = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        accountMenuOpen = false;
      }
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  });

  $effect(() => {
    if (!browser || !playbackRequested || PlaybackModal || playbackModalLoading) return;

    playbackModalLoading = true;
    void import("$lib/components/PlaybackModal.svelte")
      .then((module) => {
        PlaybackModal = module.default;
      })
      .finally(() => {
        playbackModalLoading = false;
      });
  });
</script>

<div class="shell">
  <header class="app-header">
    <div class="header-primary">
      <a class="brand" href="/movies" aria-label="Lunarr home">
        <img src="/images/lunarr-logo.svg" alt="Lunarr" />
      </a>

      <nav class="nav-list" aria-label="App navigation">
        {#each primaryNav as item}
          {@const Icon = item.icon}
          <a class="nav-item" href={item.href}>
            <Icon size={16} aria-hidden="true" />
            <span>{item.label}</span>
          </a>
        {/each}
      </nav>

      {#if desktopAdminNav.length}
        <nav class="nav-list desktop-admin-nav" aria-label="Admin navigation">
          {#each desktopAdminNav as item}
            {@const Icon = item.icon}
            <a class="nav-item" href={item.href}>
              <Icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          {/each}
        </nav>
      {/if}
    </div>

    {#if user}
      <div class="account-menu" bind:this={accountMenu}>
        <button
          class="avatar-button"
          type="button"
          aria-label="Open account menu"
          aria-haspopup="menu"
          aria-expanded={accountMenuOpen}
          onclick={() => (accountMenuOpen = !accountMenuOpen)}
        >
          <span>{(user.name || user.email || "L").slice(0, 1).toUpperCase()}</span>
        </button>

        {#if accountMenuOpen}
          <div class="account-popover" role="menu">
            <div class="account-details">
              <strong>{user.name || "Lunarr user"}</strong>
              {#if user.email}
                <span>{user.email}</span>
              {/if}
            </div>
            <a role="menuitem" href="/profile" onclick={closeAccountMenu}>
              <UserRound size={16} aria-hidden="true" />
              <span>Profile</span>
            </a>
            {#if adminNav.length}
              {#each adminNav as item}
                {@const Icon = item.icon}
                <a class:mobile-only-admin={item.href === "/libraries" || item.href === "/jobs"} role="menuitem" href={item.href} onclick={closeAccountMenu}>
                  <Icon size={16} aria-hidden="true" />
                  <span>{item.label}</span>
                </a>
              {/each}
            {/if}
            <a role="menuitem" href="/logout">
              <LogOut size={16} aria-hidden="true" />
              <span>Log out</span>
            </a>
          </div>
        {/if}
      </div>
    {/if}
  </header>

  <main>
    {@render children()}
  </main>

  {#if PlaybackModal}
    <PlaybackModal />
  {/if}
</div>

<style>
  .shell {
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .app-header {
    position: relative;
    z-index: 10;
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 4rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(7, 11, 15, 0.92);
    backdrop-filter: blur(14px);
    padding: 0.65rem clamp(1rem, 3vw, 2.4rem);
  }

  .header-primary {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    min-width: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .brand img {
    width: 8rem;
    max-width: 100%;
    height: auto;
    display: block;
  }

  .nav-list {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    min-width: 0;
  }

  .desktop-admin-nav {
    margin-left: 0.35rem;
    padding-left: 0.55rem;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
  }

  .nav-item {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.42rem;
    min-height: 2.15rem;
    color: #b7c3cc;
    border-radius: 6px;
    padding: 0.42rem 0.7rem;
    font-size: 0.9rem;
    font-weight: 650;
    white-space: nowrap;
  }

  .nav-item:hover {
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
  }

  .account-menu {
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .avatar-button {
    width: 2.4rem;
    min-height: 2.4rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    color: #f7f9fb;
    padding: 0.15rem;
    overflow: hidden;
  }

  .avatar-button:hover,
  .avatar-button[aria-expanded="true"] {
    border-color: rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.09);
  }

  .avatar-button span {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: inherit;
  }

  .avatar-button span {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #17212a;
    font-size: 0.9rem;
    font-weight: 800;
  }

  .account-popover {
    position: absolute;
    top: calc(100% + 0.55rem);
    right: 0;
    z-index: 20;
    width: min(16rem, calc(100vw - 2rem));
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    background: #0b1117;
    box-shadow: 0 1.25rem 2.5rem rgba(0, 0, 0, 0.32);
    padding: 0.35rem;
  }

  .account-details {
    display: grid;
    gap: 0.12rem;
    min-width: 0;
    padding: 0.6rem 0.65rem 0.65rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    margin-bottom: 0.25rem;
  }

  .account-details strong,
  .account-details span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-details strong {
    color: #f7f9fb;
    font-size: 0.9rem;
  }

  .account-details span {
    color: #95a4ae;
    font-size: 0.78rem;
  }

  .account-popover a {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
    border-radius: 5px;
    color: #b7c3cc;
    padding: 0.4rem 0.65rem;
    font-size: 0.88rem;
    font-weight: 650;
  }

  .account-popover a:hover {
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
  }

  .account-popover a.mobile-only-admin {
    display: none;
  }

  main {
    min-height: 0;
    min-width: 0;
    flex: 1;
    overflow: auto;
    padding: 1.4rem clamp(1rem, 3vw, 2.4rem) 3rem;
  }

  @media (max-width: 820px) {
    .app-header {
      gap: 0.55rem;
      min-height: 3.6rem;
      padding: 0.55rem 0.75rem;
    }

    .header-primary {
      flex: 1;
      gap: 0.55rem;
    }

    .brand {
      min-height: 2.15rem;
    }

    .brand img {
      width: 6.5rem;
    }

    .nav-list {
      overflow-x: auto;
      padding-bottom: 0.1rem;
      scrollbar-width: none;
    }

    .desktop-admin-nav {
      display: none;
    }

    .account-popover a.mobile-only-admin {
      display: flex;
    }

    .nav-list::-webkit-scrollbar {
      display: none;
    }

    .nav-item {
      min-height: 2rem;
      padding-inline: 0.5rem;
      font-size: 0.86rem;
    }

    .avatar-button {
      width: 2.15rem;
      min-height: 2.15rem;
    }

    main {
      padding: 1rem 1rem 2.5rem;
    }
  }
</style>
