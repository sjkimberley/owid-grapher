import {
    ExplorerProgram,
    EXPLORER_FILE_SUFFIX,
} from "../explorer/ExplorerProgram"
import { ExplorerAdminServer } from "../explorerAdmin/ExplorerAdminServer"
import { GIT_CMS_DIR } from "../gitCms/GitCmsConstants"
import {
    legacyCovidDashboardSlug,
    legacyGrapherToCovidExplorerRedirectTable,
} from "../urls/legacyCovidRedirects"

let cached: ExplorerProgram
// todo: remove
export const getLegacyCovidExplorerAsExplorerProgramForSlug = async (
    slug: string
) => {
    const row = legacyGrapherToCovidExplorerRedirectTable.where({
        slug,
    }).firstRow
    if (!row) return undefined

    if (!cached) {
        const explorerAdminServer = new ExplorerAdminServer(GIT_CMS_DIR, "")
        cached = await explorerAdminServer.getExplorerFromFile(
            legacyCovidDashboardSlug + EXPLORER_FILE_SUFFIX
        )
    }

    // todo: use querystring
    return cached
}
