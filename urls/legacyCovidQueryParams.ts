import { QueryParams, strToQueryParams } from "../clientUtils/url"
import { omitUndefinedValues } from "../clientUtils/Util"
import { Patch } from "../patch/Patch"

// In addition to the query strings above, the below ones are ones we need to redirect to the new Covid Explorer.
// It is about 80 different ones, but it may just be like a 10 liner map function that takes old params and converts
// Test case:
//
// https://ourworldindata.org/coronavirus-data-explorer?country=~FRA&cfrMetric=true
//
// should redirect to:
//
// https://staging.owid.cloud/admin/explorers/preview/coronavirus-data-explorer?patch=selection-is-France-and-Metric%20Radio-is-Case%20Fatality%20Rate
//
// Obviously the final details of the new link will change, but if we have tests and do strings as consts should be easy to finalize once we settle on the new URL details.

// queryStrings to handle:
// casesMetric=true&interval=daily&aligned=true&perCapita=true&smoothing=0
// casesMetric=true&interval=daily&perCapita=true&smoothing=0
// casesMetric=true&interval=daily&aligned=true&smoothing=0
// casesMetric=true&interval=daily&smoothing=0
// casesMetric=true&interval=weekly&smoothing=7
// casesMetric=true&interval=total&aligned=true&perCapita=true&smoothing=0
// casesMetric=true&interval=total&perCapita=true&smoothing=0
// casesMetric=true&interval=total&aligned=true&smoothing=0
// casesMetric=true&interval=total&smoothing=0
// casesMetric=true&interval=smoothed&aligned=true&perCapita=true&smoothing=7
// casesMetric=true&interval=smoothed&perCapita=true&smoothing=7
// casesMetric=true&interval=smoothed&aligned=true&smoothing=7
// casesMetric=true&interval=smoothed&smoothing=7
// casesMetric=true&interval=biweekly&smoothing=14
// casesMetric=true&interval=weeklyChange&smoothing=7
// casesMetric=true&interval=biweeklyChange&smoothing=14
// deathsMetric=true&interval=daily&aligned=true&perCapita=true&smoothing=0
// deathsMetric=true&interval=daily&perCapita=true&smoothing=0
// deathsMetric=true&interval=daily&aligned=true&smoothing=0
// deathsMetric=true&interval=daily&smoothing=0
// deathsMetric=true&interval=weekly&smoothing=7
// deathsMetric=true&interval=total&aligned=true&perCapita=true&smoothing=0
// deathsMetric=true&interval=total&perCapita=true&smoothing=0
// deathsMetric=true&interval=total&aligned=true&smoothing=0
// deathsMetric=true&interval=total&smoothing=0
// deathsMetric=true&interval=smoothed&aligned=true&perCapita=true&smoothing=7
// deathsMetric=true&interval=smoothed&perCapita=true&smoothing=7
// deathsMetric=true&interval=smoothed&aligned=true&smoothing=7
// deathsMetric=true&interval=smoothed&smoothing=7
// deathsMetric=true&interval=biweekly&smoothing=14
// deathsMetric=true&interval=weeklyChange&smoothing=7
// deathsMetric=true&interval=biweeklyChange&smoothing=14
// cfrMetric=true&interval=total&smoothing=0
// testsMetric=true&interval=daily&aligned=true&perCapita=true&smoothing=0
// testsMetric=true&interval=daily&perCapita=true&smoothing=0
// testsMetric=true&interval=daily&aligned=true&smoothing=0
// testsMetric=true&interval=daily&smoothing=0
// testsMetric=true&interval=total&aligned=true&perCapita=true&smoothing=0
// testsMetric=true&interval=total&perCapita=true&smoothing=0
// testsMetric=true&interval=total&aligned=true&smoothing=0
// testsMetric=true&interval=total&smoothing=0
// testsMetric=true&interval=smoothed&aligned=true&perCapita=true&smoothing=7
// testsMetric=true&interval=smoothed&perCapita=true&smoothing=7
// testsMetric=true&interval=smoothed&aligned=true&smoothing=7
// testsMetric=true&interval=smoothed&smoothing=7
// testsPerCaseMetric=true&interval=smoothed&smoothing=7
// testsPerCaseMetric=true&interval=total&smoothing=0
// positiveTestRate=true&interval=smoothed&smoothing=7
// positiveTestRate=true&interval=total&smoothing=0

const legacyIntervalToNewValue = {
    daily: "New per day",
    weekly: "Weekly",
    total: "Cumulative",
    smoothed: "7-day rolling average",
    biweekly: "Biweekly",
    weeklyChange: "Weekly change",
    biweeklyChange: "Biweekly change",
}

export const queryParamsFromLegacyCovidExplorerQueryParams = (
    query: string,
    base?: string
): QueryParams => {
    const {
        casesMetric,
        deathsMetric,
        cfrMetric,
        testsMetric,
        testsPerCaseMetric,
        positiveTestRate,
        vaccinationsMetric,
        aligned,
        perCapita,
        interval: intervalQueryParam,
        smoothing,
        totalFreq,
        dailyFreq,
        ...rest
    } = {
        ...strToQueryParams(base),
        ...strToQueryParams(query),
    } as QueryParams

    const queryParams: QueryParams = { ...rest }

    const patchParams: QueryParams = {}

    let interval: string | undefined = undefined

    // Early on, the query string was a few booleans like dailyFreq=true.
    // Now it is a single 'interval'. This transformation is for backward compat.
    if (intervalQueryParam) {
        interval = intervalQueryParam
    } else if (totalFreq) {
        interval = "total"
    } else if (dailyFreq) {
        interval = "daily"
    } else if (smoothing) {
        interval = "smoothed"
    }

    if (interval) {
        patchParams["Interval Dropdown"] =
            legacyIntervalToNewValue[
                interval as keyof typeof legacyIntervalToNewValue
            ]
    }

    if (casesMetric) {
        patchParams["Metric Radio"] = "Confirmed cases"
    } else if (deathsMetric) {
        patchParams["Metric Radio"] = "Confirmed deaths"
    } else if (cfrMetric) {
        patchParams["Metric Radio"] = "Case Fatality Rate"
    } else if (testsMetric) {
        patchParams["Metric Radio"] = "Tests"
    } else if (testsPerCaseMetric) {
        patchParams["Metric Radio"] = "Tests per confirmed case"
    } else if (positiveTestRate) {
        patchParams["Metric Radio"] = "Share of positive tests"
    } else if (vaccinationsMetric) {
        patchParams["Metric Radio"] = "Vaccinations"
    }

    // Since the defaults may have changed, we want to explicitly set these
    patchParams["Align outbreaks Checkbox"] = aligned ? "true" : "false"
    patchParams["Relative to Population Checkbox"] = perCapita
        ? "true"
        : "false"

    return {
        ...queryParams,
        patch: new Patch(omitUndefinedValues(patchParams)).uriEncodedString,
    }
}
