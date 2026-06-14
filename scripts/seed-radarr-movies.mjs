import { copyFile, link, mkdir, rm, stat, truncate, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_RADARR_MOVIE_FIXTURE_ROOT = path.join(".lunarr", "fixtures", "radarr", "movies");

export const PUBLIC_TEST_VIDEOS = [
  {
    title: "Big Buck Bunny 360p 1MB",
    file: "Big_Buck_Bunny_360_10s_1MB.mp4",
    url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
  },
  {
    title: "Big Buck Bunny 360p 2MB",
    file: "Big_Buck_Bunny_360_10s_2MB.mp4",
    url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_2MB.mp4",
  },
  {
    title: "Big Buck Bunny 360p 5MB",
    file: "Big_Buck_Bunny_360_10s_5MB.mp4",
    url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_5MB.mp4",
  },
  {
    title: "Big Buck Bunny 360p 10MB",
    file: "Big_Buck_Bunny_360_10s_10MB.mp4",
    url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_10MB.mp4",
  },
];

export const RADARR_MOVIE_FIXTURE = [
  {
    dir: "Walk Hard The Dewey Cox Story (2007)",
    file: "Walk Hard The Dewey Cox Story (2007) [BluRay] [720p] [YTS.AM].mp4",
    size: 848558983,
  },
  {
    dir: "Road House (2024)",
    file: "Road House (2024) [720p] [WEBRip] [YTS.MX].mp4",
    size: 1187996008,
  },
  {
    dir: "The Night My Dad Saved Christmas 2 (2025)",
    file: "The Night My Dad Saved Christmas 2 (2025) [720p] [WEBRip] [YTS.LT].mp4",
    size: 907100413,
  },
  {
    dir: "The Collection (2012)",
    file: "The Collection (2012).mp4",
    size: 733866783,
  },
  {
    dir: "The Acid House (1998)",
    file: "The Acid House (1998) [720p] [WEBRip] [YTS.MX].mp4",
    size: 1069126581,
  },
  {
    dir: "Over Your Dead Body (2026)",
    file: "Over Your Dead Body (2026) 720p WEBRip-LAMA.mp4",
    size: 1015317167,
  },
  {
    dir: "Project Hail Mary (2026)",
    file: "Project Hail Mary (2026) IMAX 720p WEBRip-LAMA.mp4",
    size: 1507069365,
  },
  {
    dir: "The Nice Guys (2016)",
    file: "The.Nice.Guys.2016.720p.BRRip.x264.AAC-ETRG.mp4",
    size: 912089201,
  },
  {
    dir: "The Ring (2002)",
    file: "The Ring (2002) 720P Bluray X264 [Moviesfd].mkv",
    size: 920532241,
  },
  {
    dir: "Operation Fortune Ruse de Guerre (2023)",
    file: "Operation.Fortune.Ruse.de.Guerre.2023.720p.WEBRip.800MB.x264-GalaxyRG[TGx].mkv",
    size: 835843139,
  },
  {
    dir: "Point Break (1991)",
    file: "Point Break (1991).mp4",
    size: 908207616,
  },
  {
    dir: "Michael (2026)",
    file: "Michael.2026.720p.TELESYNC.x264-DkS.mkv",
    size: 1894666285,
  },
  {
    dir: "The Marvels (2023)",
    file: "The.Marvels.2023.720p.WEBRip.800MB.x264-GalaxyRG[TGx].mkv",
    size: 836021820,
  },
  {
    dir: "The Wizard of Oz (1939)",
    file: "The.Wizard.of.Oz.1939.1080p.BrRip.x264.BOKUTOX.YIFY.mp4",
    size: 1506857011,
  },
  {
    dir: "God Bless America (2012)",
    file: "God Bless America (2011) [720p] [BluRay] [YTS.MX].mp4",
    size: 1005432412,
  },
  {
    dir: "Hereditary (2018)",
    file: "Hereditary (2018) [BluRay] [720p] [YTS.AM].mp4",
    size: 1145761362,
  },
  {
    dir: "Furiosa A Mad Max Saga (2024)",
    file: "Furiosa A Mad Max Saga (2024) [720p] [BluRay].mp4",
    size: 1335115502,
  },
  {
    dir: "Who Framed Roger Rabbit (1988)",
    file: "Who Framed Roger Rabbit 1988 720p bluray YTS.mp4",
    size: 914935117,
  },
  {
    dir: "Austin Powers International Man of Mystery (1997)",
    file: "Austin Powers - International Man of Mystery 1997 720p bluray YTS.mp4",
    size: 734122773,
  },
  {
    dir: "The Nightmare Before Christmas (1993)",
    file: "The Nightmare Before Christmas (1993) 720p BRRip 750MB - MkvCage.mkv",
    size: 787857586,
  },
  {
    dir: "Old Dads (2023)",
    file: "Old.Dads.2023.720p.WEBRip.800MB.x264-GalaxyRG[TGx].mkv",
    size: 840328061,
  },
  {
    dir: "Jackie Brown (1997)",
    file: "Jackie.brown.1997.720p.BluRay.x264.[MoviesFD].mkv",
    size: 1250919657,
  },
  {
    dir: "A Hard Day's Night (1964)",
    file: "A Hard Day's Night (1964) [YTS.AG].mp4",
    size: 657061351,
  },
  {
    dir: "It's All Gone Pete Tong (2004)",
    file: "It's All Gone Pete Tong (2004) [YTS.AG].mp4",
    size: 707404163,
  },
  { dir: "G.I. Joe Retaliation (2013)", file: "GOAIPB~6.MP4", size: 909324717 },
  {
    dir: "Tom and Jerry The Movie (1992)",
    file: "Tom and Jerry - The Movie (1992) 720p WEB-DL x264 Eng Subs [Dual Audio] [Hindi DD 2.0 - English 2.0].mkv",
    size: 823332042,
  },
  {
    dir: "Deadpool & Wolverine (2024)",
    file: "Deadpool Wolverine (2024) 720p WEBRip-LAMA.mp4",
    size: 1232740664,
  },
  { dir: "Heat (1995)", file: "Heat (1995).mkv", size: 891223780 },
  {
    dir: "Guillermo del Toro's Pinocchio (2022)",
    file: "Guillermo Del Toros Pinocchio (2022) [720p] [BluRay] [YTS.MX].mp4",
    size: 1135861118,
  },
  {
    dir: "Pandora's Box (1929)",
    file: "Pandoras Box (1929) [720p] [BluRay] [YTS.MX].mp4",
    size: 1285578989,
  },
  {
    dir: "Big Nothing (2006)",
    file: "Big Nothing 2006 720p bluray YTS.mp4",
    size: 760395416,
  },
  {
    dir: "Basic Instinct (1992)",
    file: "Basic Instinct (1992).mp4",
    size: 892333463,
  },
  {
    dir: "The Naked Gun From the Files of Police Squad! (1988)",
    file: "The Naked Gun From The Files Of Police Squad! (1988) [720p] [BluRay] [YTS.MX].mp4",
    size: 818927030,
  },
  {
    dir: "Sin City (2005)",
    file: "Sin City EXTENDED and UNRATED (2005).mp4",
    size: 891933973,
  },
  {
    dir: "The Illusionist (2006)",
    file: "The Illusionist [2006] BDRip 720p [Eng Rus]-Junoon.mkv",
    size: 806432085,
  },
  {
    dir: "L.A. Confidential (1997)",
    file: "L.A Confidential (1997).mkv",
    size: 628495437,
  },
  {
    dir: "The Third Wave (2003)",
    file: "Den Tredje Vagen (2003) [720p] [WEBRip] [YTS.MX].mp4",
    size: 1099242889,
  },
  {
    dir: "We Bury the Dead (2026)",
    file: "We Bury The Dead (2024) [720p] [WEBRip] [YTS.BZ].mp4",
    size: 914547547,
  },
  {
    dir: "Dune (2021)",
    file: "Dune (2021) [720p] [BluRay] [YTS.MX].mp4",
    size: 1496263846,
  },
  {
    dir: "A Man Called Otto (2022)",
    file: "A.Man.Called.Otto.2022.720p.BluRay.800MB.x264-GalaxyRG[TGx].mkv",
    size: 984398409,
  },
  {
    dir: "Harry Potter and the Order of the Phoenix (2007)",
    file: "Harry Potter And The Order Of The Phoenix (2007) [720p] [BluRay] [YTS.MX].mp4",
    size: 1332437101,
  },
  {
    dir: "Casino (1995)",
    file: "Casino (1995) [REPACK] [720p] [BluRay] [YTS.MX].mp4",
    size: 1717661338,
  },
  {
    dir: "The Hunt for Red October (1990)",
    file: "The Hunt for Red October 1990 720p PTV WEB-DL AAC 2 0 H 264-PiRaTeS.mkv",
    size: 2174294088,
  },
  { dir: "M (1931)", file: "M 1931 720p bluray YTS.mp4", size: 929324347 },
  {
    dir: "The Nun (1967)",
    file: "The Nun (1966) [BluRay] [720p] [YTS.AM].mp4",
    size: 1201062338,
  },
  {
    dir: "A Goofy Movie (1995)",
    file: "A Goofy Movie 1995 720p bluray YTS.mp4",
    size: 704369372,
  },
  {
    dir: "The Gentlemen (2020)",
    file: "The Gentlemen (2019) [720p] [BluRay] [YTS.MX].mp4",
    size: 1094180689,
  },
  {
    dir: "Beverly Hills Cop Axel F (2024)",
    file: "Beverly Hills Cop Axel F (2024) [720p] [WEBRip] [YTS.MX].mp4",
    size: 1135107772,
  },
  {
    dir: "The Matrix (1999)",
    file: "The Matrix 1999 REMASTERED PROPER 720p BluRay H264 AAC RARBG ORARBG.mp4",
    size: 1767860294,
  },
  {
    dir: "The Fantastic Four First Steps (2025)",
    file: "The Fantastic Four First Steps 2025 Eng 720p WEBRip x264 AAC ES.mkv",
    size: 1113049485,
  },
  {
    dir: "South Park (Not Suitable for Children) (2023)",
    file: "South.Park.Not.Suitable.For.Children.2023.720p.WEBRip.400MB.x264-GalaxyRG.mkv",
    size: 417641559,
  },
  {
    dir: "Get Out (2017)",
    file: "Get Out 2017 [ Bolly4u.wiki ] Dual Audio BluRay 720p 800MB.mkv",
    size: 847683639,
  },
  {
    dir: "BASEketball (1998)",
    file: "BASEketball (1998) [720p] [BluRay] [YTS.MX].mp4",
    size: 994441921,
  },
  {
    dir: "Shoot 'Em Up (2007)",
    file: "Shoot 'Em Up (2007).mp4",
    size: 732434840,
  },
  {
    dir: "The Stuff (1985)",
    file: "The Stuff (1985) [YTS.AG].mp4",
    size: 638474361,
  },
  {
    dir: "Me, Myself & Irene (2000)",
    file: "My Myself and Irene (2000).mp4",
    size: 787135894,
  },
  { dir: "Ex Machina (2015)", file: "Ex Machina (2015).mp4", size: 847344617 },
];

function parseArgs(argv) {
  const options = {
    target: DEFAULT_RADARR_MOVIE_FIXTURE_ROOT,
    clean: false,
    playback: false,
    sparse: false,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--clean") {
      options.clean = true;
    } else if (arg === "--playback") {
      options.playback = true;
    } else if (arg === "--sparse") {
      options.sparse = true;
    } else if (arg === "--target") {
      options.target = argv[index + 1] ?? options.target;
      index += 1;
    } else if (arg.startsWith("--target=")) {
      options.target = arg.slice("--target=".length);
    } else if (arg === "--limit") {
      options.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (!arg.startsWith("-")) {
      options.target = arg;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  if (options.playback && options.sparse) {
    throw new Error("--playback and --sparse cannot be used together");
  }

  return options;
}

function fixtureContent(entry) {
  return [
    "Lunarr Radarr movie fixture",
    `Directory: ${entry.dir}`,
    `File: ${entry.file}`,
    `Remote size: ${entry.size}`,
    "",
  ].join("\n");
}

async function existingFileSize(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() ? info.size : 0;
  } catch {
    return 0;
  }
}

async function downloadSampleVideo(video, cachePath, fetcher = fetch) {
  if ((await existingFileSize(cachePath)) > 0) {
    return cachePath;
  }

  const response = await fetcher(video.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${video.title}: HTTP ${response.status}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0) {
    throw new Error(`Downloaded empty sample video for ${video.title}`);
  }

  await writeFile(cachePath, body);
  return cachePath;
}

function sampleVideoForEntry(entry, videos) {
  let hash = 0;
  const key = `${entry.dir}/${entry.file}`;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return videos[hash % videos.length];
}

async function linkOrCopy(sourcePath, targetPath) {
  await rm(targetPath, { force: true });
  try {
    await link(sourcePath, targetPath);
  } catch {
    await copyFile(sourcePath, targetPath);
  }
}

export async function seedRadarrMovieFixture({
  target = DEFAULT_RADARR_MOVIE_FIXTURE_ROOT,
  clean = false,
  playback = false,
  sparse = false,
  limit = null,
  fetcher = fetch,
  sampleVideos = PUBLIC_TEST_VIDEOS,
} = {}) {
  if (playback && sparse) {
    throw new Error("playback and sparse modes cannot be used together");
  }
  if (playback && sampleVideos.length === 0) {
    throw new Error("playback mode requires at least one sample video");
  }

  const root = path.resolve(target);
  const entries = limit === null ? RADARR_MOVIE_FIXTURE : RADARR_MOVIE_FIXTURE.slice(0, limit);
  const cacheRoot = path.resolve(root, "..", ".sample-video-cache");

  if (clean) {
    await rm(root, { recursive: true, force: true });
  }

  await mkdir(root, { recursive: true });
  if (playback) {
    await mkdir(cacheRoot, { recursive: true });
  }

  for (const entry of entries) {
    const directory = path.join(root, entry.dir);
    const filePath = path.join(directory, entry.file);
    await mkdir(directory, { recursive: true });

    if (playback) {
      const sampleVideo = sampleVideoForEntry(entry, sampleVideos);
      const cachePath = path.join(cacheRoot, sampleVideo.file);
      await downloadSampleVideo(sampleVideo, cachePath, fetcher);
      await linkOrCopy(cachePath, filePath);
    } else if (sparse) {
      await writeFile(filePath, "");
      await truncate(filePath, entry.size);
    } else {
      await writeFile(filePath, fixtureContent(entry));
    }
  }

  return {
    root,
    files: entries.length,
    playback,
    sparse,
    cacheRoot: playback ? cacheRoot : null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await seedRadarrMovieFixture(options);
  const info = await stat(result.root);

  if (!info.isDirectory()) {
    throw new Error(`Fixture target is not a directory: ${result.root}`);
  }

  console.log(`Seeded ${result.files} Radarr movie files in ${result.root}`);
  if (result.playback) {
    console.log(`Mode: playable public sample videos cached in ${result.cacheRoot}`);
  } else {
    console.log(result.sparse ? "Mode: sparse files with remote sizes" : "Mode: small mock files");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
