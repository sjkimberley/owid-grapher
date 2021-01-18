import express, { Router } from "express"
import * as path from "path"
import {
    renderFrontPage,
    renderPageBySlug,
    renderChartsPage,
    renderMenuJson,
    renderSearchPage,
    renderDonatePage,
    entriesByYearPage,
    makeAtomFeed,
    pagePerVariable,
    feedbackPage,
    renderNotFoundPage,
    renderBlogByPageNum,
    renderCovidPage,
    countryProfileCountryPage,
} from "../baker/siteRenderers"
import { grapherSlugToHtmlPage } from "../baker/GrapherBaker"
import { BAKED_BASE_URL, BAKED_GRAPHER_URL } from "../settings/clientSettings"
import {
    WORDPRESS_DIR,
    BASE_DIR,
    BAKED_SITE_DIR,
} from "../settings/serverSettings"
import * as db from "../db/db"
import { expectInt, renderToHtmlPage } from "./serverUtil"
import {
    countryProfilePage,
    countriesIndexPage,
} from "../baker/countryProfiles"
import { makeSitemap } from "../baker/sitemap"
import { OldChart } from "../db/model/Chart"
import { countryProfileSpecs } from "../site/countryProfileProjects"
import { getLegacyCovidExplorerAsExplorerProgramForSlug } from "../baker/replaceLegacyCovidExplorer"
import { ExplorerAdminServer } from "../explorerAdmin/ExplorerAdminServer"
import { grapherToSVG } from "../baker/GrapherImageBaker"
import { getVariableData } from "../db/model/Variable"
import { MultiEmbedderTestPage } from "../site/multiembedder/MultiEmbedderTestPage"
import { bakeEmbedSnippet } from "../site/webpackUtils"
import { JsonError } from "../clientUtils/owidTypes"
import { GIT_CMS_DIR } from "../gitCms/GitCmsConstants"

require("express-async-errors")

// todo: switch to an object literal where the key is the path and the value is the request handler? easier to test, reflect on, and manipulate
const mockSiteRouter = Router()

mockSiteRouter.use(express.urlencoded({ extended: true }))
mockSiteRouter.use(express.json())

mockSiteRouter.get("/sitemap.xml", async (req, res) =>
    res.send(await makeSitemap())
)

mockSiteRouter.get("/atom.xml", async (req, res) =>
    res.send(await makeAtomFeed())
)

mockSiteRouter.get("/entries-by-year", async (req, res) =>
    res.send(await entriesByYearPage())
)

mockSiteRouter.get(`/entries-by-year/:year`, async (req, res) =>
    res.send(await entriesByYearPage(parseInt(req.params.year)))
)

mockSiteRouter.get(
    "/grapher/data/variables/:variableIds.json",
    async (req, res) => {
        res.set("Access-Control-Allow-Origin", "*")
        res.json(
            await getVariableData(
                (req.params.variableIds as string)
                    .split("+")
                    .map((v) => expectInt(v))
            )
        )
    }
)

mockSiteRouter.get("/grapher/embedCharts.js", async (req, res) =>
    res.send(bakeEmbedSnippet())
)

mockSiteRouter.get("/grapher/latest", async (req, res) => {
    const latestRows = await db.queryMysql(
        `SELECT config->>"$.slug" AS slug FROM charts where starred=1`
    )
    if (latestRows.length)
        res.redirect(`${BAKED_GRAPHER_URL}/${latestRows[0].slug}`)
    else throw new JsonError("No latest chart", 404)
})

const explorerAdminServer = new ExplorerAdminServer(GIT_CMS_DIR, BAKED_BASE_URL)
explorerAdminServer.addMockBakedSiteRoutes(mockSiteRouter)

mockSiteRouter.get("/grapher/:slug", async (req, res) => {
    // XXX add dev-prod parity for this
    res.set("Access-Control-Allow-Origin", "*")
    const explorerProgram = await getLegacyCovidExplorerAsExplorerProgramForSlug(
        req.params.slug
    )
    if (!explorerProgram) res.send(await grapherSlugToHtmlPage(req.params.slug))
    else res.send(await explorerAdminServer.renderExplorerPage(explorerProgram))
})

mockSiteRouter.get("/", async (req, res) => res.send(await renderFrontPage()))

mockSiteRouter.get("/donate", async (req, res) =>
    res.send(await renderDonatePage())
)

mockSiteRouter.get("/charts", async (req, res) =>
    res.send(await renderChartsPage())
)

countryProfileSpecs.forEach((spec) =>
    mockSiteRouter.get(`/${spec.rootPath}/:countrySlug`, async (req, res) =>
        res.send(await countryProfileCountryPage(spec, req.params.countrySlug))
    )
)

// Route only available on the dev server
mockSiteRouter.get("/covid", async (req, res) =>
    res.send(await renderCovidPage())
)

mockSiteRouter.get("/search", async (req, res) =>
    res.send(await renderSearchPage())
)

mockSiteRouter.get("/blog", async (req, res) =>
    res.send(await renderBlogByPageNum(1))
)

mockSiteRouter.get("/blog/page/:pageno", async (req, res) => {
    const pagenum = parseInt(req.params.pageno, 10)
    if (!isNaN(pagenum))
        res.send(await renderBlogByPageNum(isNaN(pagenum) ? 1 : pagenum))
    else throw new Error("invalid page number")
})

mockSiteRouter.get("/headerMenu.json", async (req, res) =>
    res.send(await renderMenuJson())
)

mockSiteRouter.use(
    // Not all /app/uploads paths are going through formatting
    // and being rewritten as /uploads. E.g. blog index images paths
    // on front page.
    ["/uploads", "/app/uploads"],
    express.static(path.join(WORDPRESS_DIR, "web/app/uploads"), {
        fallthrough: false,
    })
)

mockSiteRouter.use(
    "/exports",
    express.static(path.join(BAKED_SITE_DIR, "exports"))
)

mockSiteRouter.use("/grapher/exports/:slug.svg", async (req, res) => {
    const grapher = await OldChart.getBySlug(req.params.slug)
    const vardata = await grapher.getVariableData()
    res.setHeader("Content-Type", "image/svg+xml")
    res.send(await grapherToSVG(grapher.config, vardata))
})

mockSiteRouter.use("/", express.static(path.join(BASE_DIR, "public")))

mockSiteRouter.get("/indicator/:variableId/:country", async (req, res) => {
    const variableId = expectInt(req.params.variableId)
    res.send(await pagePerVariable(variableId, req.params.country))
})

mockSiteRouter.get("/countries", async (req, res) =>
    res.send(await countriesIndexPage(BAKED_BASE_URL))
)

mockSiteRouter.get("/country/:countrySlug", async (req, res) =>
    res.send(await countryProfilePage(req.params.countrySlug, BAKED_BASE_URL))
)

mockSiteRouter.get("/feedback", async (req, res) =>
    res.send(await feedbackPage())
)

mockSiteRouter.get("/multiEmbedderTest", async (req, res) =>
    res.send(
        renderToHtmlPage(
            MultiEmbedderTestPage(req.query.globalEntityControl === "true")
        )
    )
)

mockSiteRouter.get("/*", async (req, res) => {
    const slug = req.path.replace(/^\//, "").replace("/", "__")
    try {
        res.send(await renderPageBySlug(slug))
    } catch (e) {
        console.error(e)
        res.send(await renderNotFoundPage())
    }
})

export { mockSiteRouter }
