import { parseMediaName, normalizeTitle, titleSimilarity, parseEpisode, extractYear, editDistance } from "../src/lib/media/normalize";
const names = [
  "28 Years Later (2025) 720p BluRay x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv",
  "10x10 (2018) 720p BluRay x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv",
  "5x2 (2004) (France)",
  "18×2 Beyond Youthful Days (2024) 720p WEBRip (Taiwan)",
  "Morichika S01E01 2021 720P[FreeDriveMovie.com]WEBDL h264.mp4",
  "1925 - The Pleasure Garden.avi",
  "2001 A Space Odyssey (1968) 1080p",
  "1917 (2019) 1080p",
  "Blade Runner 2049 (2017) 1080p",
  "Avengers-Endgame (2019) 1080p",
  "The English Patient (1996) 720p",
  "Fast & Furious (2009) 1080p",
  "The Dark Knight (2008) 1080p",
  "Spider-Man - Far from Home (2019) 1080p",
  "Ghost In The Shell (2017) English 3D 1080p BluRay Half-SBS x264 AAC 5.1.mkv",
  "Alfred Hitchcock-Complete Filmography (1925-1934)",
  "Breaking.Bad.S01E01.720p.BluRay.x264.mkv",
];
for (const n of names) console.log(n, "=>", parseMediaName(n));
console.log("episodes", ["10x10", "Morichika S01E01", "5x2", "18X2"].map(x=>[x,parseEpisode(x)]));
console.log("years", ["1917", "1917 (2019)", "2001 A Space Odyssey (1968)", "1925 - The Pleasure Garden", "1925-1934"].map(x=>[x,extractYear(x)]));
console.log("sim", [
 ["Avngers Endgame","Avengers: Endgame"],
 ["Interstllar","Interstellar"],
 ["Spiderman","Spider-Man"],
 ["Fast and Furios","Fast & Furious"],
 ["Jhon Wick","John Wick"],
 ["Dark Knight","The Dark Knight"],
].map(([q,t])=>[q,t,titleSimilarity(q,t)]));
console.log("lev", editDistance("jhon","john",3), normalizeTitle("Fast & Furious"), normalizeTitle("The Dark Knight"));
