// Landing page audit: desktop (video) + mobile screenshot, copy dump, broken images.
import { launch, shot, brokenImages, report, APEX } from "./onboarding-lib.mjs";

// ---- Desktop ----
{
  const { page, finish } = await launch({ videoName: "landing-desktop.webm" });
  await page.goto(APEX + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "01-landing-desktop-viewport.png");
  await shot(page, "02-landing-desktop-full.png", { fullPage: true });

  // Dump visible copy + CTAs for PM review.
  const copy = await page.evaluate(() => {
    const texts = [];
    for (const el of document.querySelectorAll("h1,h2,h3,p,a,button")) {
      const t = el.innerText?.trim().replace(/\s+/g, " ");
      if (t) texts.push(`<${el.tagName.toLowerCase()}> ${t}`);
    }
    return [...new Set(texts)];
  });
  console.log("---- LANDING COPY ----");
  for (const c of copy) console.log(c);
  console.log("---- title:", await page.title());
  console.log(
    "---- meta description:",
    await page
      .locator('meta[name="description"]')
      .getAttribute("content")
      .catch(() => null),
  );

  // Scroll through for the video.
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(600);
  await page.mouse.wheel(0, 1600);
  await page.waitForTimeout(600);

  const broken = await brokenImages(page);
  const log = await finish();
  report("LANDING DESKTOP", log, { brokenImages: broken });
}

// ---- Mobile ----
{
  const { page, finish } = await launch({ mobile: true });
  await page.goto(APEX + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "03-landing-mobile-viewport.png");
  await shot(page, "04-landing-mobile-full.png", { fullPage: true });
  const hscroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  const broken = await brokenImages(page);
  const log = await finish();
  report("LANDING MOBILE", log, {
    brokenImages: broken,
    horizontalScroll: [String(hscroll)],
  });
}
