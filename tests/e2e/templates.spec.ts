import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleTheme } from "./helpers/settle-theme";
const viewer = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/groups", (route) =>
    route.fulfill({
      json: {
        viewer_id: viewer,
        groups: [],
        stats: { total: 0, reviewed: 0, needsReview: 0 },
      },
    }),
  );
});
test("templates persist, edit, duplicate, reopen in Compose and delete", async ({
  page,
}) => {
  let templates: {
    id: string;
    user_id: string;
    name: string;
    text: string;
    assets: unknown[];
    revision: number;
    state: string;
    created_at: string;
    updated_at: string;
  }[] = [];
  let writes = 0;
  await page.route("**/api/templates**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET") {
      const selected = templates.find(
        (item) => item.id === url.searchParams.get("id"),
      );
      return route.fulfill({
        json: selected
          ? { template: selected, assets: [], viewer_id: viewer }
          : { templates, viewer_id: viewer },
      });
    }
    writes++;
    const command = request.postDataJSON();
    if (request.method() === "DELETE") {
      templates = templates.filter((item) => item.id !== command.id);
      return route.fulfill({
        json: { deleted_id: command.id, viewer_id: viewer },
      });
    }
    let template;
    if (command.operation === "create") {
      template = {
        ...command.content,
        id,
        user_id: viewer,
        revision: 1,
        state: "ready",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      templates.push(template);
    } else if (command.operation === "save") {
      const index = templates.findIndex((item) => item.id === command.id);
      template = {
        ...templates[index],
        ...command.content,
        revision: command.revision + 1,
      };
      templates[index] = template;
    } else {
      const source = templates.find((item) => item.id === command.id)!;
      template = {
        ...source,
        id: "33333333-3333-4333-8333-333333333333",
        name: `${source.name} (copy)`,
        revision: 1,
      };
      templates.push(template);
    }
    return route.fulfill({ json: { template, viewer_id: viewer } });
  });
  await page.goto("/dashboard/templates");
  await expect(
    page.getByText("No templates yet.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create Template" }).click();
  await page.getByLabel("Template name").fill("Weekend offer");
  await page
    .getByLabel("Post text", { exact: true })
    .fill("Two nights by the sea.");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Weekend offer", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Weekend offer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Post text", { exact: true })
    .fill("Updated weekend offer.");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(
    page
      .locator(".reference-template-preview")
      .getByText("Updated weekend offer.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Weekend offer (copy)", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search templates").fill("copy");
  await expect(
    page.getByRole("heading", { name: "Weekend offer", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Use template", exact: true }).click();
  await expect(page.getByLabel("Post text", { exact: true })).toHaveValue(
    "Updated weekend offer.",
  );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: /I reviewed this exact text/ }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Close post review" }).click();
  expect(writes).toBe(3);
  await page.goto("/dashboard/templates");
  await page.getByRole("button", { name: /^Weekend offer \(copy\)/ }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Weekend offer (copy)", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => document.documentElement.classList.add("light"));
  await settleTheme(page, "light");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("templates preserve unsaved text on backend errors", async ({ page }) => {
  await page.route("**/api/templates", (route) =>
    route.fulfill({
      status: route.request().method() === "GET" ? 200 : 409,
      json:
        route.request().method() === "GET"
          ? { templates: [], viewer_id: viewer }
          : { error: "Template changed. Reload before saving." },
    }),
  );
  await page.goto("/dashboard/templates");
  await page.getByRole("button", { name: "Create Template" }).click();
  await page.getByLabel("Template name").fill("Unsaved");
  await page.getByLabel("Post text", { exact: true }).fill("Keep this text");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(page.locator(".template-library [role=alert]")).toContainText(
    "Template changed",
  );
  await expect(page.getByLabel("Post text", { exact: true })).toHaveValue(
    "Keep this text",
  );
});

test("template attachments upload privately, finalize and restore verified media", async ({
  page,
}) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=",
    "base64",
  );
  let current: {
    id: string;
    user_id: string;
    name: string;
    text: string;
    assets: {
      id: string;
      name: string;
      content_type: string;
      size: number;
      sha256: string;
      object_path: string;
      uploaded: boolean;
    }[];
    revision: number;
    state: string;
    created_at: string;
    updated_at: string;
  } | null = null;
  let uploaded = false;
  let finalized = false;
  await page.route("https://template-storage.test/**", async (route) => {
    if (route.request().method() === "PUT") {
      uploaded = true;
      expect(route.request().headers()["x-upsert"]).toBe("false");
      return route.fulfill({ json: { Key: "fixture" } });
    }
    return route.fulfill({ body: png, contentType: "image/png" });
  });
  await page.route("**/api/templates**", (route) => {
    const request = route.request();
    if (request.method() === "GET")
      return route.fulfill({
        json: new URL(request.url()).searchParams.has("id")
          ? {
              template: current,
              viewer_id: viewer,
              assets: current?.assets.map((asset) => ({
                id: asset.id,
                url: `https://template-storage.test/storage/v1/object/sign/template-media/${asset.object_path}?token=fixture`,
              })),
            }
          : { templates: current ? [current] : [], viewer_id: viewer },
      });
    const command = request.postDataJSON();
    if (command.operation === "create") {
      current = {
        ...command.content,
        id,
        user_id: viewer,
        assets: command.content.assets.map((asset: object) => ({
          ...asset,
          object_path: `${viewer}/${id}/fixture`,
          uploaded: false,
        })),
        revision: 1,
        state: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } else if (command.operation === "upload")
      return route.fulfill({
        json: {
          template: current,
          viewer_id: viewer,
          upload: {
            signedUrl: `https://template-storage.test/storage/v1/object/upload/sign/template-media/${viewer}/${id}/fixture?token=fixture`,
          },
        },
      });
    else if (command.operation === "finalize") {
      expect(uploaded).toBe(true);
      finalized = true;
      current = {
        ...current!,
        assets: current!.assets.map((asset) => ({ ...asset, uploaded: true })),
        revision: 2,
        state: "ready",
      };
    }
    return route.fulfill({ json: { template: current, viewer_id: viewer } });
  });
  await page.goto("/dashboard/templates");
  await page.getByRole("button", { name: "Create Template" }).click();
  await page.getByLabel("Template name").fill("Photo offer");
  await page.getByLabel("Post text", { exact: true }).fill("A photo offer.");
  await page
    .getByLabel("Attachments", { exact: true })
    .setInputFiles({ name: "offer.png", mimeType: "image/png", buffer: png });
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Photo offer", exact: true }),
  ).toBeVisible();
  expect(finalized).toBe(true);
  await page.getByRole("link", { name: "Use template", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Attachment 1: offer.png" }),
  ).toBeVisible();
  await expect(page.getByLabel("Post text", { exact: true })).toHaveValue(
    "A photo offer.",
  );
});

test("reloading after an account switch clears the old template editor", async ({
  page,
}) => {
  let switched = false;
  const template = {
    id,
    user_id: viewer,
    name: "Private draft",
    text: "Old account text",
    assets: [],
    revision: 1,
    state: "ready",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await page.route("**/api/templates", (route) => {
    if (route.request().method() !== "GET")
      return route.fulfill({
        status: 409,
        json: { error: "Your account changed. Reload." },
      });
    return route.fulfill({
      json: {
        viewer_id: switched ? "33333333-3333-4333-8333-333333333333" : viewer,
        templates: switched ? [] : [template],
      },
    });
  });
  await page.goto("/dashboard/templates");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Post text", { exact: true })).toHaveValue(
    "Old account text",
  );
  switched = true;
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(page.getByLabel("Post text", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Private draft", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".template-library [role=alert]")).toContainText(
    "account changed",
  );
});
