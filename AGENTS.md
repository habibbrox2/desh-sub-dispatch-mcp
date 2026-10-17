# AGENTS.md — Production Release Instructions

This file defines the standard procedure every agent must follow before committing and pushing to production.

## 1. Pre-Flight Checks

- [ ] `npm run build` completes with **zero errors**
- [ ] `npm test` passes (all tests green)
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] Bundle exists at `dist/server.bundle.cjs`
- [ ] `node dist/server.bundle.cjs --print-config` runs successfully
- [ ] HTTP smoke test: `PORT=3999 node dist/server.bundle.cjs --http` → `/health` returns 200

## 2. Security Checks

- [ ] No secrets/tokens committed (search for `ghp_`, `sk-`, passwords)
- [ ] `.env` / `*.db` / `node_modules` are gitignored
- [ ] `MCP_AUTH_TOKEN` documented in README
- [ ] Dependencies audited: `npm audit` (fix critical/high)

## 3. Documentation Checks

- [ ] `README.md` and `README.bn.md` updated and consistent in design
- [ ] GitHub Pages link present in both READMEs
- [ ] `CLAUDE.md` reflects current tools
- [ ] Version bumped in `package.json` and `src/server.ts`

## 4. Git Hygiene

- [ ] Working tree clean before starting: `git status`
- [ ] Create a feature branch for changes (optional but recommended)
- [ ] Meaningful commit messages (conventional commits preferred)
- [ ] No large binary blobs except the bundle

## 5. Production Release Procedure

1. **Bump version** in `package.json` and `src/server.ts`
2. **Build**: `npm run build`
3. **Test**: `npm test`
4. **Commit & push source**:
   ```bash
   git add -A
   git commit -m "release: v<X.Y.Z>"
   git push origin main
   ```
5. **Tag the release**:
   ```bash
   git tag v<X.Y.Z>
   git push origin v<X.Y.Z>
   ```
6. **Create GitHub Release** with the bundle attached:
   - Upload `dist/server.bundle.cjs` as release asset
   - Include changelog in release notes
7. **Verify** the release download URL returns the bundle
8. **Update GitHub Pages** if docs changed (auto-deploys from `docs/`)

## 6. Post-Release Verification

- [ ] Download bundle from release URL
- [ ] Run: `node server.bundle.cjs --http` → check `/health`
- [ ] Test one tool call end-to-end
- [ ] Confirm GitHub Pages is live

## 7. Rollback Plan

If a release is broken:
- Revert the commit: `git revert <commit>`
- Push and create a new patch release `v<X.Y.Z+1>`
- Remove broken release from GitHub (optional)

---

> Every production deployment MUST follow this checklist. No exceptions.