import { expect, test, type Page } from '@playwright/test';

const adminUsername = process.env.E2E_ADMIN_USERNAME ?? 'admin';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'admin123';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('用户名').fill(adminUsername);
  await page.getByLabel('密码').fill(adminPassword);
  await page
    .getByRole('main')
    .getByRole('button', { name: '登录', exact: true })
    .click();

  await expect(page).toHaveURL(/\/workspace(?:\?|$)/);
}

test('未登录用户可以查看公开质量大盘，但看不到“大盘”页标题', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: '质量大盘', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '大盘', exact: true })).toHaveCount(0);
  await expect(page.getByText('登录后可查看详细数据、分析用例和保存资产')).toBeVisible();
});

test('管理员登录后立即获得与角色匹配的导航', async ({ page }) => {
  await loginAsAdmin(page);

  const navigation = page.getByRole('navigation', { name: '主导航' });
  await expect(navigation.getByRole('link', { name: '工作台', exact: true })).toBeVisible();
  await expect(navigation.getByRole('link', { name: '导入', exact: true })).toBeVisible();
  await expect(navigation.getByRole('link', { name: '系统管理', exact: true })).toBeVisible();
});

test('管理员可以打开项目和工作台并完成真实用例筛选', async ({ page }) => {
  await loginAsAdmin(page);

  const navigation = page.getByRole('navigation', { name: '主导航' });
  await navigation.getByRole('link', { name: '项目', exact: true }).click();
  await expect(page).toHaveURL(/\/projects(?:\?|$)/);
  await expect(page.getByRole('heading', { name: '项目管理', exact: true })).toBeVisible();
  await expect(page.getByText('支付系统', { exact: true }).first()).toBeVisible();

  await navigation.getByRole('link', { name: '工作台', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace(?:\?|$)/);

  const projectFilter = page.getByLabel('项目', { exact: true });
  await expect(projectFilter.getByRole('option', { name: '支付系统' })).toBeAttached();
  await projectFilter.selectOption({ label: '支付系统' });
  await expect(projectFilter.locator('option:checked')).toHaveText('支付系统');
  await expect.poll(() => new URL(page.url()).searchParams.has('projectId')).toBe(true);

  const searchTerm = '微信支付-超时退款';
  const filteredCasesResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/cases' &&
      url.searchParams.get('search') === searchTerm &&
      response.status() === 200
    );
  });

  await page.getByLabel('搜索用例').fill(searchTerm);
  await filteredCasesResponse;
  await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe(searchTerm);
  await expect(page.getByText(searchTerm, { exact: true }).first()).toBeVisible();
});

test('存活与就绪健康端点可用', async ({ request }) => {
  const liveResponse = await request.get('/api/health/live');
  expect(liveResponse.status()).toBe(200);
  await expect(liveResponse.json()).resolves.toMatchObject({
    status: 'alive',
    check: 'liveness',
  });

  const readyResponse = await request.get('/api/health/ready');
  expect(readyResponse.status()).toBe(200);
  await expect(readyResponse.json()).resolves.toMatchObject({
    status: 'ready',
    check: 'readiness',
  });
});
