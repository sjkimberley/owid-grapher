import urlParseLib from "url-parse"

import { QueryParams, strToQueryParams } from "../clientUtils/url"
import { Patch } from "../patch/Patch"

const parseUrl = (url: string) => {
    const parsed = urlParseLib(url, {})
    // The library returns an unparsed string for `query`, its types are quite right.
    const query = parsed.query.toString()
    return {
        ...parsed,
        query,
    }
}

interface UrlMigration {
    if?: (url: URL) => boolean
    migrate: (url: URL) => URL
}

// There is a separate pipeline for Graphers and for Explorers

// For latest explorer:
// 1. Change + country separator to ~
// 2. Transform `country` to `selection`
// 3. Transform legacyCovidExplorer to gridExplorer

// How to inject explorer transform when Grapher charts?
// 1. Run all Grapher transforms first
// 2. Run Grapher → Explorer transform
// 3. Run all Explorer transforms

// Some things like year=<dateOffset> don't work without the underlying
// chart data, those still need to be performed inside Grapher.

// Need to handle path changes too, e.g. for new CovidExplorer.
// Some way to bind the URL?

interface UrlProps {
    readonly url?: string // https://ourworldindata.org/grapher/abc?stackMode=relative#articles
    readonly base?: string // https://ourworldindata.org
    readonly pathname?: string // /grapher/abc
    readonly query?: string // ?stackMode=relative
    readonly hash?: string // #articles
}

// The Url should be immutable, and there should be a controller
// that accepts it and updates the URL

class Url {
    private props: UrlProps

    /**
     * @param url Absolute or relative URL
     */
    static fromURL(url: string) {
        const { origin, pathname, query, hash } = parseUrl(url)
        const base =
            origin !== undefined && origin !== "null" ? origin : undefined
        // TODO add tests to make sure that "" → undefined
        return new Url({
            url: url,
            base: base || undefined,
            pathname: pathname || undefined,
            query: query || undefined,
            hash: hash || undefined,
        })
    }

    static fromQueryStr(queryStr: string) {
        // need to make sure that when updating Window, we don't update the path
        // because the path isn't set
        return new Url({
            query: queryStr,
        })
    }

    private constructor(props: UrlProps) {
        this.props = props
    }

    get queryParams(): QueryParams {
        return strToQueryParams(this.props.query)
    }

    // DO NOT USE this in transforms, because the `patch` param name
    // may change over time
    get patch() {
        return new Patch()
    }

    get search(): string {
        return ""
    }

    clientSideRedirect(path: string) {}

    updateWindow() {
        // set window url based on this object
    }
}

//

// interface UrlOptions {
//     setWindowUrl: (url: Url) => void
// }

// const urlOptionsDefault: UrlOptions = {
//     setWindowUrl: (url) => {
//         const pathname = url.pathname ?? window.location.pathname
//         const search = url.search
//         history.replaceState(null, document.title)
//     },
// }
