import React from "react"
import ReactDOM from "react-dom"
import { GrapherInterface } from "grapher/core/GrapherInterface"
import { Grapher } from "grapher/core/Grapher"
import {
    computed,
    action,
    observable,
    IReactionDisposer,
    Lambda,
    reaction,
} from "mobx"
import { observer } from "mobx-react"
import { bind } from "decko"
import {
    pick,
    lastOfNonEmptyArray,
    capitalize,
    mergeQueryStr,
    next,
    startCase,
    exposeInstanceOnWindow,
} from "grapher/utils/Util"
import {
    ControlOption,
    ExplorerControlPanel,
    DropdownOption,
} from "explorer/client/ExplorerControls"
import { CovidQueryParams } from "./CovidParams"
import { CountryPicker } from "grapher/controls/CountryPicker"
import { CovidExplorerTable } from "./CovidExplorerTable"
import { BAKED_BASE_URL } from "settings"
import moment from "moment"
import {
    CovidRow,
    covidDashboardSlug,
    coronaDefaultView,
    covidDataPath,
    sourceCharts,
    metricLabels,
    metricPickerColumnSpecs,
    intervalSpecs,
    MetricOptions,
    IntervalOptions,
    ColorScaleOptions,
} from "./CovidConstants"
import {
    ColorScheme,
    ColorSchemes,
    continentColors,
} from "grapher/color/ColorSchemes"
import {
    GlobalEntitySelection,
    GlobalEntitySelectionModes,
} from "site/globalEntityControl/GlobalEntitySelection"
import { ColorScaleConfigInterface } from "grapher/color/ColorScaleConfig"
import { BinningStrategy } from "grapher/color/BinningStrategies"
import {
    MultipleUrlBinder,
    ObservableUrl,
    UrlBinder,
} from "grapher/utils/UrlBinder"
import {
    ChartTypeName,
    DimensionProperty,
    ScaleType,
} from "grapher/core/GrapherConstants"
import { LegacyChartDimensionInterface } from "coreTable/LegacyVariableCode"
import { queryParamsToStr } from "utils/client/url"
import {
    getLeastUsedColor,
    fetchRequiredData,
    perCapitaDivisorByMetric,
} from "./CovidExplorerUtils"
import { ExplorerShell } from "explorer/client/ExplorerShell"

interface BootstrapProps {
    containerNode: HTMLElement
    isEmbed?: boolean // todo: what specifically does this mean? Does it mean IFF in an iframe? Or does it mean in an iframe OR hoisted?
    queryStr?: string
    globalEntitySelection?: GlobalEntitySelection
    bindToWindow?: boolean
}

interface CovidExplorerProps {
    covidRows: CovidRow[]
    params: CovidQueryParams
    covidChartAndVariableMeta: {
        charts: any
        variables: any
    }
    updated: string
    queryStr?: string
    isEmbed?: boolean
    globalEntitySelection?: GlobalEntitySelection
    enableKeyboardShortcuts?: boolean
    bindToWindow?: boolean
}

@observer
export class CovidExplorer
    extends React.Component<CovidExplorerProps>
    implements ObservableUrl {
    static async bootstrap(props: BootstrapProps) {
        const { covidRows, updated, covidMeta } = await fetchRequiredData()
        const queryStr =
            props.queryStr && CovidQueryParams.hasAnyCovidParam(props.queryStr)
                ? props.queryStr
                : coronaDefaultView
        const startingParams = new CovidQueryParams(queryStr)
        return ReactDOM.render(
            <CovidExplorer
                covidRows={covidRows}
                updated={updated}
                params={startingParams}
                covidChartAndVariableMeta={covidMeta}
                queryStr={queryStr}
                isEmbed={props.isEmbed}
                globalEntitySelection={props.globalEntitySelection}
                enableKeyboardShortcuts={true}
                bindToWindow={props.bindToWindow}
            />,
            props.containerNode
        )
    }

    private uniqId = Math.random().toString(36).substr(2, 8)

    // Since there can be multiple explorers embedded on a page, we need to use distinct names when
    // creating radio button groups, etc.
    private getScopedName(name: string) {
        return `${name}_${this.uniqId}`
    }

    static async replaceStateAndBootstrap(
        explorerQueryStr: string,
        props: BootstrapProps
    ) {
        const queryStr = mergeQueryStr(explorerQueryStr, props.queryStr)
        window.history.replaceState(
            null,
            document.title,
            `${BAKED_BASE_URL}/${covidDashboardSlug}${queryStr}`
        )
        return CovidExplorer.bootstrap({
            ...props,
            queryStr,
        })
    }

    @observable private chartContainerRef: React.RefObject<
        HTMLDivElement
    > = React.createRef()

    private get metricPanel() {
        const options: ControlOption[] = [
            {
                available: true,
                label: metricLabels.cases,
                checked: this.constrainedParams.casesMetric,
                value: MetricOptions.cases,
            },
            {
                available: true,
                label: metricLabels.deaths,
                checked: this.constrainedParams.deathsMetric,
                value: MetricOptions.deaths,
            },

            {
                available: true,
                label: metricLabels.case_fatality_rate,
                checked: this.constrainedParams.cfrMetric,
                value: MetricOptions.case_fatality_rate,
            },
        ]

        const optionsColumn2: ControlOption[] = [
            {
                available: true,
                label: metricLabels.tests,
                checked: this.constrainedParams.testsMetric,
                value: MetricOptions.tests,
            },
            {
                available: true,
                label: metricLabels.tests_per_case,
                checked: this.constrainedParams.testsPerCaseMetric,
                value: MetricOptions.tests_per_case,
            },
            {
                available: true,
                label: metricLabels.positive_test_rate,
                checked: this.constrainedParams.positiveTestRate,
                value: MetricOptions.positive_test_rate,
            },
        ]
        return [
            <ExplorerControlPanel
                key="metric1"
                title="Metric"
                explorerSlug="covid"
                name={this.getScopedName("metric")}
                options={options}
                onChange={this.changeMetric}
                isCheckbox={false}
            />,
            <ExplorerControlPanel
                key="metric2"
                title="Metric"
                explorerSlug="covid"
                hideTitle={true}
                name={this.getScopedName("metric")}
                onChange={this.changeMetric}
                options={optionsColumn2}
                isCheckbox={false}
            />,
        ]
    }

    @action.bound private changeMetric(metric: string) {
        this.props.params.setMetric(metric as MetricOptions)
        this.renderControlsThenUpdateGrapher()
    }

    private get frequencyPanel() {
        const writeableParams = this.props.params
        const { available } = this.constrainedParams
        const options: DropdownOption[] = [
            {
                available: true,
                label: intervalSpecs.total.label,
                value: IntervalOptions.total,
            },
            {
                available: available.smoothed,
                label: intervalSpecs.smoothed.label,
                value: IntervalOptions.smoothed,
            },
            {
                available: available.daily,
                label: intervalSpecs.daily.label,
                value: IntervalOptions.daily,
            },
            {
                available: available.weekly,
                label: intervalSpecs.weekly.label,
                value: IntervalOptions.weekly,
            },
            {
                available: available.weekly,
                label: intervalSpecs.weeklyChange.label,
                value: IntervalOptions.weeklyChange,
            },
            {
                available: available.weekly,
                label: intervalSpecs.biweekly.label,
                value: IntervalOptions.biweekly,
            },
            {
                available: available.weekly,
                label: intervalSpecs.biweeklyChange.label,
                value: IntervalOptions.biweeklyChange,
            },
        ]
        return (
            <ExplorerControlPanel
                key="interval"
                title="Interval"
                name={this.getScopedName("interval")}
                dropdownOptions={options}
                value={this.constrainedParams.interval}
                options={[]}
                onChange={(value: string) => {
                    writeableParams.setTimeline(value as IntervalOptions)
                    this.renderControlsThenUpdateGrapher()
                }}
                explorerSlug="covid"
            />
        )
    }

    @computed private get constrainedParams() {
        return this.props.params.constrainedParams
    }

    @computed private get perCapitaPanel() {
        const { available } = this.constrainedParams
        const options: ControlOption[] = [
            {
                available: available.perCapita,
                label: capitalize(this.perCapitaOptions[this.perCapitaDivisor]),
                checked: this.constrainedParams.perCapita,
                value: "true",
            },
        ]
        return (
            <ExplorerControlPanel
                key="count"
                title="Count"
                name={this.getScopedName("count")}
                isCheckbox={true}
                options={options}
                explorerSlug="covid"
                onChange={(value) => {
                    this.props.params.perCapita = value === "true"
                    this.renderControlsThenUpdateGrapher()
                }}
            />
        )
    }

    @computed private get alignedPanel() {
        const { available } = this.constrainedParams
        const options: ControlOption[] = [
            {
                available: available.aligned,
                label: "Align outbreaks",
                checked: this.constrainedParams.aligned,
                value: "true",
            },
        ]
        return (
            <ExplorerControlPanel
                key="timeline"
                title="Timeline"
                name={this.getScopedName("timeline")}
                isCheckbox={true}
                options={options}
                onChange={(value) => {
                    this.props.params.aligned = value === "true"
                    this.renderControlsThenUpdateGrapher()
                }}
                comment={this.constrainedParams.trajectoryColumnOption.name}
                explorerSlug="covid"
            />
        )
    }

    @computed private get howLongAgo() {
        return moment.utc(this.props.updated).fromNow()
    }

    private get header() {
        return (
            <>
                <div>Coronavirus Pandemic</div>
                <div className="ExplorerTitle">Data Explorer</div>
                <div className="ExplorerSubtitle" title={this.howLongAgo}>
                    Download the complete <em>Our World in Data</em>{" "}
                    <a
                        href="https://github.com/owid/covid-19-data/tree/master/public/data"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        COVID-19 dataset.
                    </a>
                </div>
            </>
        )
    }

    private explorerSlug = "Covid"

    private get countryPicker() {
        return (
            <CountryPicker
                explorerSlug={this.explorerSlug}
                table={this.table}
                pickerColumnSlugs={
                    new Set(Object.keys(metricPickerColumnSpecs))
                }
                isDropdownMenu={false}
                optionColorMap={this.countryNameToColorMap}
                userState={this.props.params}
                countriesMustHaveColumns={this.activeColumnSlugs}
            ></CountryPicker>
        )
    }

    @computed private get activeColumnSlugs(): string[] {
        return [this.xColumn?.slug, this.yColumn?.slug].filter(
            (i) => i
        ) as string[]
    }

    private get panels() {
        return [
            ...this.metricPanel,
            this.frequencyPanel,
            this.perCapitaPanel,
            this.alignedPanel,
        ]
    }

    render() {
        return (
            <ExplorerShell
                headerElement={this.header}
                controlPanels={this.panels}
                explorerSlug={this.explorerSlug}
                countryPickerElement={this.countryPicker}
                hideControls={this.props.params.hideControls}
                isEmbed={!!this.props.isEmbed}
                ref={this.explorerRef}
                enableKeyboardShortcuts={this.props.enableKeyboardShortcuts}
            />
        )
    }

    @observable.ref explorerRef: React.RefObject<
        ExplorerShell
    > = React.createRef()

    @computed private get showExplorerControls() {
        return !this.props.params.hideControls || !this.props.isEmbed
    }

    @computed private get selectedCountryOptions(): string[] {
        const codeMap = this.grapher.table.entityNameToCodeMap
        return this.grapher.table.availableEntityNames.filter((option) =>
            this.props.params.selectedCountryCodes.has(codeMap.get(option)!)
        )
    }

    @computed private get perCapitaDivisor() {
        return perCapitaDivisorByMetric(this.constrainedParams.metricName)
    }

    @computed private get perCapitaOptions() {
        return {
            1: "",
            1e3: "per 1,000 people",
            1e6: "per million people",
        }
    }

    private perCapitaTitle(metric: MetricOptions) {
        return this.constrainedParams.perCapita
            ? " " + this.perCapitaOptions[perCapitaDivisorByMetric(metric)]
            : ""
    }

    @computed private get chartTitle() {
        let title = ""
        const params = this.constrainedParams
        const interval = params.interval

        if (params.yColumn || params.xColumn)
            return startCase(`${this.yColumn.name} by ${this.xColumn?.name}`)

        const isCumulative = interval === IntervalOptions.total
        const freq = params.intervalTitle
        if (params.cfrMetric)
            title = `Case fatality rate of the ongoing COVID-19 pandemic`
        else if (params.positiveTestRate)
            title = `The share of ${
                isCumulative ? "" : "daily "
            }COVID-19 tests that are positive`
        else if (params.testsPerCaseMetric)
            title = `${
                isCumulative ? `Cumulative tests` : `Tests`
            } conducted per confirmed case of COVID-19`
        else if (params.testsMetric) title = `${freq} COVID-19 tests`
        else if (params.deathsMetric)
            title = `${freq} confirmed COVID-19 deaths`
        else if (params.casesMetric) title = `${freq} confirmed COVID-19 cases`

        return title + this.perCapitaTitle(params.metricName)
    }

    @computed private get weekSubtitle() {
        const params = this.constrainedParams
        const metric = params.deathsMetric
            ? MetricOptions.deaths
            : MetricOptions.cases

        if (params.interval === IntervalOptions.weekly)
            return `Weekly confirmed ${metric} refer to the cumulative number of confirmed ${metric} over the previous week.`
        if (params.interval === IntervalOptions.biweekly)
            return `Biweekly confirmed ${metric} refer to the cumulative number of confirmed ${metric} over the previous two weeks.`
        if (params.interval === IntervalOptions.weeklyChange)
            return `The weekly growth rate on any given date measures the percentage change in number of confirmed ${metric} over the last seven days relative to the number in the previous seven days.`
        if (params.interval === IntervalOptions.biweeklyChange)
            return `The biweekly growth rate on any given date measures the percentage change in the number of new confirmed ${metric} over the last 14 days relative to the number in the previous 14 days.`

        return ""
    }

    @computed private get subtitle() {
        const params = this.constrainedParams
        if (params.yColumn || params.xColumn) return ""

        if (params.isWeekly || params.isBiweekly) return this.weekSubtitle

        const smoothing = params.smoothing
            ? `Shown is the rolling ${params.smoothing}-day average. `
            : ""
        return `${smoothing}${this.yColumn?.description || ""}`
    }

    @computed private get note() {
        const params = this.constrainedParams

        if (params.yColumn || params.xColumn) return ""

        if (params.testsMetric)
            return "For testing figures, there are substantial differences across countries in terms of the units, whether or not all labs are included, the extent to which negative and pending tests are included and other aspects. Details for each country can be found on ourworldindata.org/covid-testing."
        return ""
    }

    private _countryNameToColorMapCache: {
        [key: string]: string | undefined
    } = {}

    @computed private get countryNameToColorMap(): {
        [key: string]: string | undefined
    } {
        const names = this.selectedCountryOptions.map((country) => country)
        // If there isn't a color for every country name, we need to update the color map
        if (!names.every((name) => name in this._countryNameToColorMapCache)) {
            // Omit any unselected country names from color map
            const newColorMap = pick(this._countryNameToColorMapCache, names)
            // Check for name *key* existence, not value.
            // `undefined` value means we want the color to be automatic, determined by the chart.
            const namesWithoutColor = names.filter(
                (name) => !(name in newColorMap)
            )
            // For names that don't have a color, assign one.
            namesWithoutColor.forEach((name) => {
                const scheme = ColorSchemes["owid-distinct"] as ColorScheme
                const availableColors = lastOfNonEmptyArray(scheme.colorSets)
                const usedColors = Object.values(newColorMap).filter(
                    (color) => color !== undefined
                ) as string[]
                newColorMap[name] = getLeastUsedColor(
                    availableColors,
                    usedColors
                )
            })
            // Update the country color map cache
            this._countryNameToColorMapCache = newColorMap
        }

        return this._countryNameToColorMapCache
    }

    private renderControlsThenUpdateGrapher() {
        // Updating the chart may take a second so render the Data Explorer controls immediately then the chart.
        setTimeout(() => {
            this.updateGrapher()
        }, 1)
    }

    private rootTable = new CovidExplorerTable(this.props.covidRows)
        .withDataTableSpecs()
        .loadColumnSpecTemplatesFromGrapherBackend(
            this.props.covidChartAndVariableMeta.variables
        )
        .withAnnotationColumns()

    private _computedTable?: CovidExplorerTable
    private get computedTable() {
        return this._computedTable ? this._computedTable! : this.rootTable
    }

    @computed private get canDoLogScale() {
        if (
            this.constrainedParams.positiveTestRate ||
            this.constrainedParams.cfrMetric ||
            (this.constrainedParams.intervalChange &&
                this.constrainedParams.intervalChange > 1)
        )
            return false
        return true
    }

    private switchBackToLog = false

    @computed private get table() {
        const params = this.constrainedParams
        let table = this.computedTable

        // Init column for epi color strategy if needed
        if (params.colorStrategy === ColorScaleOptions.ptr) {
            table = table.withShortTermPositivityRate()
            this.shortTermPositivityRateSlug = table.lastColumnSlug
        }

        table = table.withRequestedColumns(params)

        const shouldFilterNegatives =
            (params.casesMetric || params.deathsMetric) &&
            !(params.interval === IntervalOptions.total) &&
            !params.intervalChange

        const shouldFilterGroups =
            (params.casesMetric || params.deathsMetric) &&
            !(params.interval === IntervalOptions.total) &&
            !params.intervalChange

        if (shouldFilterNegatives)
            table = table.filterNegatives(params.yColumnSlug)
        if (shouldFilterGroups) table = table.filterGroups()

        // table.setSelectedEntitiesByCode(Array.from(params.selectedCountryCodes)) // why 2?

        // multimetric table
        if (params.tableMetrics)
            table = table.withDataTableColumnsInTable(params)

        this._computedTable = table

        return table
    }

    @computed private get sourceChartId(): number {
        return (sourceCharts as any)[this.constrainedParams.sourceChartKey]
    }

    @computed private get sourceChart(): GrapherInterface | undefined {
        return this.props.covidChartAndVariableMeta.charts[this.sourceChartId]
    }

    private updateMapSettings() {
        const map = this.grapher.map
        const region = map.projection

        Object.assign(map, this.sourceChart?.map || this.defaultMapConfig)

        map.time = undefined
        map.columnSlug = this.yColumn.slug

        // Preserve region
        if (region) map.projection = region
    }

    componentDidMount() {
        if (this.props.bindToWindow) this.bindToWindow()
        this.grapher = this.explorerRef.current!.grapherRef.current!
        const grapher = this.grapher
        // Show 'Add country' & 'Select countries' controls if the explorer controls are hidden.
        grapher.hideEntityControls = this.showExplorerControls
        grapher.externalCsvLink = covidDataPath
        grapher.bakedGrapherURL = `${BAKED_BASE_URL}/${covidDashboardSlug}`
        this.updateGrapher()
        this.observeGlobalEntitySelection()
        exposeInstanceOnWindow(this, "covidDataExplorer")
    }

    private observeGlobalEntitySelection() {
        const { globalEntitySelection } = this.props
        if (globalEntitySelection) {
            this.disposers.push(
                reaction(
                    () => [
                        globalEntitySelection.mode,
                        globalEntitySelection.selectedEntities,
                    ],
                    () => {
                        const { mode, selectedEntities } = globalEntitySelection
                        if (mode === GlobalEntitySelectionModes.override) {
                            this.props.params.selectedCountryCodes = new Set(
                                selectedEntities.map((entity) => entity.code)
                            )
                            this.renderControlsThenUpdateGrapher()
                        }
                    },
                    { fireImmediately: true }
                )
            )
        }
    }

    bindToWindow() {
        const url = new MultipleUrlBinder([this.grapher, this])
        new UrlBinder().bindToWindow(url)
    }

    @computed get params() {
        return this.props.params.toQueryParams
    }

    disposers: (IReactionDisposer | Lambda)[] = []

    @bind dispose() {
        this.disposers.forEach((dispose) => dispose())
    }

    @computed private get yColumn() {
        const slug = this.constrainedParams.yColumnSlug
        const col = this.table.get(slug)!
        if (!col) debugger
        return col
    }

    @computed private get xColumn() {
        return this.constrainedParams.xColumnSlug
            ? this.table.get(this.constrainedParams.xColumnSlug!)!
            : undefined
    }

    @computed private get sizeColumn() {
        return this.constrainedParams.sizeColumn
            ? this.table.get(this.constrainedParams.sizeColumn!)!
            : undefined
    }

    @computed private get yDimension(): LegacyChartDimensionInterface {
        const yColumn = this.yColumn
        return {
            property: DimensionProperty.y,
            slug: yColumn.slug,
            variableId: 0,
        }
    }

    @computed private get xDimension(): LegacyChartDimensionInterface {
        const xColumn = this.xColumn!
        return {
            property: DimensionProperty.x,
            slug: xColumn.slug,
            variableId: 0,
        }
    }

    @computed private get dimensionSpecs(): LegacyChartDimensionInterface[] {
        if (this.constrainedParams.type !== ChartTypeName.ScatterPlot)
            return [this.yDimension]

        const dimensions = [this.yDimension, this.xDimension]

        if (this.constrainedParams.colorStrategy !== ColorScaleOptions.none)
            dimensions.push(this.colorDimension)
        if (this.sizeColumn) dimensions.push(this.sizeDimension)
        return dimensions
    }

    @computed private get sizeDimension(): LegacyChartDimensionInterface {
        return {
            property: DimensionProperty.size,
            slug: this.sizeColumn?.slug,
            variableId: 0,
        }
    }

    private shortTermPositivityRateSlug = ""
    @computed private get colorDimension(): LegacyChartDimensionInterface {
        const slug =
            this.constrainedParams.colorStrategy ===
            ColorScaleOptions.continents
                ? ColorScaleOptions.continents
                : this.shortTermPositivityRateSlug

        // todo: tolerance 10
        return {
            property: DimensionProperty.color,
            slug,
            variableId: 0,
        }
    }

    @computed private get colorScales(): {
        [name: string]: ColorScaleConfigInterface
    } {
        return {
            ptr: this.props.covidChartAndVariableMeta.charts[sourceCharts.epi]
                ?.colorScale as any,
            continents: {
                binningStrategy: BinningStrategy.manual,
                legendDescription: "Continent",
                baseColorScheme: undefined,
                customNumericValues: [],
                customNumericLabels: [],
                customNumericColors: [],
                customCategoryColors: continentColors,
                customCategoryLabels: {
                    "No data": "Other",
                },
                customHiddenCategories: {},
            },
            none: {
                binningStrategy: BinningStrategy.manual,
                legendDescription: "",
                baseColorScheme: undefined,
                customNumericValues: [],
                customNumericLabels: [],
                customNumericColors: [],
                customCategoryColors: continentColors,
                customCategoryLabels: {
                    "No data": "",
                },
                customHiddenCategories: {},
            },
        }
    }

    private defaultMapConfig() {
        return {
            columnSlug: ColorScaleOptions.continents,
            timeTolerance: 7,
            projection: "World",
            colorScale: {
                colorSchemeValues: [],
                colorSchemeLabels: [],
                customNumericColors: [],
                customCategoryColors: {},
                customCategoryLabels: {},
                customHiddenCategories: {},
            },
        }
    }

    @computed private get yAxisLabel() {
        return this.constrainedParams.yColumn
            ? this.constrainedParams.yColumnSlug
            : ""
    }

    @observable.ref grapher = new Grapher()

    // We can't create a new chart object with every radio change because the Chart component itself
    // maintains state (for example, which tab is currently active). Temporary workaround is just to
    // manually update the chart when the chart builderselections change.
    // todo: cleanup
    @action.bound private updateGrapher() {
        const params = this.constrainedParams
        const grapher = this.grapher
        grapher.title = this.chartTitle
        grapher.subtitle = this.subtitle
        grapher.note = this.note

        // If we switch to scatter, set zoomToSelection to true. I don't set it to true initially in the chart
        // config because then it won't appear in the URL.
        if (
            grapher.type === ChartTypeName.LineChart &&
            params.type === ChartTypeName.ScatterPlot
        )
            grapher.zoomToSelection = true

        grapher.hideTitleAnnotation = true
        grapher.slug = covidDashboardSlug
        grapher.type = params.type
        grapher.yAxis.removePointsOutsideDomain = true
        grapher.yAxis.label = this.yAxisLabel

        if (!this.canDoLogScale) {
            this.switchBackToLog = grapher.yAxis.scaleType === ScaleType.log
            grapher.yAxis.scaleType = ScaleType.linear
            grapher.yAxis.canChangeScaleType = undefined
        } else {
            grapher.yAxis.canChangeScaleType = true
            if (this.switchBackToLog) {
                grapher.yAxis.scaleType = ScaleType.log
                this.switchBackToLog = false
            }
        }

        grapher.rootTable = this.table
        grapher.hasMapTab = true
        grapher.isPublished = true
        grapher.yAxis.min = params.intervalChange ? undefined : 0
        grapher.setDimensionsFromConfigs(this.dimensionSpecs)

        this.updateMapSettings()

        grapher.colorScale.updateFromObject(
            this.colorScales[params.colorStrategy]
        )

        grapher.dataTableColumnSlugsToShow = this.table.columnSlugsToShowInDataTable(
            params
        )

        grapher.id = this.sourceChartId
        grapher.baseQueryString = queryParamsToStr(
            this.props.params.toQueryParams
        )
    }
}
