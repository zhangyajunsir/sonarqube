/*
 * SonarQube
 * Copyright (C) 2009-2017 SonarSource SA
 * mailto:info AT sonarsource DOT com
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */
// @flow
import React from 'react';
import classNames from 'classnames';
import { throttle, flatten, sortBy } from 'lodash';
import { bisector, extent, max } from 'd3-array';
import { scaleLinear, scalePoint, scaleTime } from 'd3-scale';
import { line as d3Line, area, curveBasis } from 'd3-shape';

type Event = { className?: string, name: string, date: Date };
export type Point = { x: Date, y: number | string };
export type Serie = { name: string, data: Array<Point>, style: string };
type Scale = Function;

type Props = {
  basisCurve?: boolean,
  endDate: ?Date,
  events?: Array<Event>,
  eventSize?: number,
  disableZoom?: boolean,
  formatYTick?: number => string,
  hideGrid?: boolean,
  hideXAxis?: boolean,
  height: number,
  width: number,
  leakPeriodDate?: Date,
  metricType: string,
  padding: Array<number>,
  selectedDate?: Date,
  series: Array<Serie>,
  showAreas?: boolean,
  showEventMarkers?: boolean,
  startDate: ?Date,
  updateSelectedDate?: (selectedDate: ?Date) => void,
  updateTooltipPos?: (tooltipXPos: ?number, tooltipIdx: ?number) => void,
  updateZoom?: (start: ?Date, endDate: ?Date) => void,
  zoomSpeed: number
};

type State = {
  maxXRange: Array<number>,
  mouseOverlayPos?: { [string]: number },
  selectedDateXPos: ?number,
  selectedDateIdx: ?number,
  yScale: Scale,
  xScale: Scale
};

export default class AdvancedTimeline extends React.PureComponent {
  props: Props;
  state: State;

  static defaultProps = {
    eventSize: 8,
    padding: [10, 10, 30, 60],
    zoomSpeed: 1
  };

  constructor(props: Props) {
    super(props);
    const scales = this.getScales(props);
    this.state = { ...scales, ...this.getSelectedDatePos(scales.xScale, props.selectedDate) };
    this.updateSelectedDate = throttle(this.updateSelectedDate, 40);
  }

  componentWillReceiveProps(nextProps: Props) {
    if (
      nextProps.metricType !== this.props.metricType ||
      nextProps.startDate !== this.props.startDate ||
      nextProps.endDate !== this.props.endDate ||
      nextProps.width !== this.props.width ||
      nextProps.padding !== this.props.padding ||
      nextProps.height !== this.props.height ||
      nextProps.series !== this.props.series
    ) {
      this.setState(this.getScales(nextProps));
    }

    if (nextProps.selectedDate !== this.props.selectedDate) {
      this.setState((state: State) => {
        const selectedDatePos = this.getSelectedDatePos(state.xScale, nextProps.selectedDate);
        if (nextProps.updateTooltipPos) {
          nextProps.updateTooltipPos(
            selectedDatePos.selectedDateXPos,
            selectedDatePos.selectedDateIdx
          );
        }
        return selectedDatePos;
      });
    }
  }

  getRatingScale = (availableHeight: number) =>
    scalePoint().domain([5, 4, 3, 2, 1]).range([availableHeight, 0]);

  getLevelScale = (availableHeight: number) =>
    scalePoint().domain(['ERROR', 'WARN', 'OK']).range([availableHeight, 0]);

  getYScale = (props: Props, availableHeight: number, flatData: Array<Point>) => {
    if (props.metricType === 'RATING') {
      return this.getRatingScale(availableHeight);
    } else if (props.metricType === 'LEVEL') {
      return this.getLevelScale(availableHeight);
    } else {
      return scaleLinear().range([availableHeight, 0]).domain([0, max(flatData, d => d.y)]).nice();
    }
  };

  getXScale = (props: Props, availableWidth: number, flatData: Array<Point>) => {
    const dateRange = extent(flatData, d => d.x);
    const start = props.startDate ? props.startDate : dateRange[0];
    const end = props.endDate ? props.endDate : dateRange[1];
    const xScale = scaleTime().domain(sortBy([start, end])).range([0, availableWidth]).clamp(false);
    return {
      xScale,
      maxXRange: dateRange.map(xScale)
    };
  };

  getScales = (props: Props) => {
    const availableWidth = props.width - props.padding[1] - props.padding[3];
    const availableHeight = props.height - props.padding[0] - props.padding[2];
    const flatData = flatten(props.series.map((serie: Serie) => serie.data));
    return {
      ...this.getXScale(props, availableWidth, flatData),
      yScale: this.getYScale(props, availableHeight, flatData)
    };
  };

  getSelectedDatePos = (xScale: Scale, selectedDate: ?Date) => {
    const firstSerie = this.props.series[0];
    if (selectedDate && firstSerie) {
      const idx = firstSerie.data.findIndex(
        // $FlowFixMe selectedDate can't be null there
        p => p.x.valueOf() === selectedDate.valueOf()
      );
      if (
        idx >= 0 &&
        this.props.series.some(serie => serie.data[idx].y || serie.data[idx].y === 0)
      ) {
        return {
          selectedDateXPos: xScale(selectedDate),
          selectedDateIdx: idx
        };
      }
    }
    return { selectedDateXPos: null, selectedDateIdx: null };
  };

  getEventMarker = (size: number) => {
    const half = size / 2;
    return `M${half} 0 L${size} ${half} L ${half} ${size} L0 ${half} L${half} 0 L${size} ${half}`;
  };

  getMouseOverlayPos = (target: HTMLElement) => {
    if (this.state.mouseOverlayPos) {
      return this.state.mouseOverlayPos;
    }
    const pos = target.getBoundingClientRect();
    this.setState({ mouseOverlayPos: pos });
    return pos;
  };

  handleWheel = (evt: WheelEvent & { target: HTMLElement }) => {
    evt.preventDefault();
    const { maxXRange, xScale } = this.state;
    const parentBbox = this.getMouseOverlayPos(evt.target);
    const mouseXPos = (evt.pageX - parentBbox.left) / parentBbox.width;
    const xRange = xScale.range();
    const speed = evt.deltaMode ? 25 / evt.deltaMode * this.props.zoomSpeed : this.props.zoomSpeed;
    const leftPos = xRange[0] - Math.round(speed * evt.deltaY * mouseXPos);
    const rightPos = xRange[1] + Math.round(speed * evt.deltaY * (1 - mouseXPos));
    const startDate = leftPos > maxXRange[0] ? xScale.invert(leftPos) : null;
    const endDate = rightPos < maxXRange[1] ? xScale.invert(rightPos) : null;
    // $FlowFixMe updateZoom can't be undefined at this point
    this.props.updateZoom(startDate, endDate);
  };

  handleMouseMove = (evt: MouseEvent & { target: HTMLElement }) => {
    const parentBbox = this.getMouseOverlayPos(evt.target);
    this.updateSelectedDate(evt.pageX - parentBbox.left);
  };

  updateSelectedDate = (xPos: number) => {
    const { updateSelectedDate } = this.props;
    const firstSerie = this.props.series[0];
    if (firstSerie && updateSelectedDate) {
      const date = this.state.xScale.invert(xPos);
      const bisectX = bisector(d => d.x).right;
      let idx = bisectX(firstSerie.data, date);
      if (idx >= 0) {
        const previousPoint = firstSerie.data[idx - 1];
        const nextPoint = firstSerie.data[idx];
        if (!nextPoint || (previousPoint && date - previousPoint.x <= nextPoint.x - date)) {
          idx--;
        }
        updateSelectedDate(firstSerie.data[idx].x);
      }
    }
  };

  renderHorizontalGrid = () => {
    const { formatYTick } = this.props;
    const { xScale, yScale } = this.state;
    const hasTicks = typeof yScale.ticks === 'function';
    const ticks = hasTicks ? yScale.ticks(4) : yScale.domain();

    if (!ticks.length) {
      ticks.push(yScale.domain()[1]);
    }

    return (
      <g>
        {ticks.map(tick => (
          <g key={tick}>
            {formatYTick != null &&
              <text
                className="line-chart-tick line-chart-tick-x"
                dx="-1em"
                dy="0.3em"
                textAnchor="end"
                x={xScale.range()[0]}
                y={yScale(tick)}>
                {formatYTick(tick)}
              </text>}
            <line
              className="line-chart-grid"
              x1={xScale.range()[0]}
              x2={xScale.range()[1]}
              y1={yScale(tick)}
              y2={yScale(tick)}
            />
          </g>
        ))}
      </g>
    );
  };

  renderXAxisTicks = () => {
    const { xScale, yScale } = this.state;
    const format = xScale.tickFormat(7);
    const ticks = xScale.ticks(7);
    const y = yScale.range()[0];
    return (
      <g>
        {ticks.slice(0, -1).map((tick, index) => {
          const nextTick = index + 1 < ticks.length ? ticks[index + 1] : xScale.domain()[1];
          const x = (xScale(tick) + xScale(nextTick)) / 2;
          return (
            <text key={index} className="line-chart-tick" x={x} y={y} dy="1.5em">
              {format(tick)}
            </text>
          );
        })}
      </g>
    );
  };

  renderLeak = () => {
    const yRange = this.state.yScale.range();
    const xRange = this.state.xScale.range();
    const leakWidth = xRange[xRange.length - 1] - this.state.xScale(this.props.leakPeriodDate);
    if (leakWidth < 0) {
      return null;
    }
    return (
      <rect
        x={this.state.xScale(this.props.leakPeriodDate)}
        y={yRange[yRange.length - 1]}
        width={leakWidth}
        height={yRange[0] - yRange[yRange.length - 1]}
        fill="#fbf3d5"
      />
    );
  };

  renderLines = () => {
    const lineGenerator = d3Line()
      .defined(d => d.y || d.y === 0)
      .x(d => this.state.xScale(d.x))
      .y(d => this.state.yScale(d.y));
    if (this.props.basisCurve) {
      lineGenerator.curve(curveBasis);
    }
    return (
      <g>
        {this.props.series.map(serie => (
          <path
            key={serie.name}
            className={classNames('line-chart-path', 'line-chart-path-' + serie.style)}
            d={lineGenerator(serie.data)}
          />
        ))}
      </g>
    );
  };

  renderAreas = () => {
    const areaGenerator = area()
      .defined(d => d.y || d.y === 0)
      .x(d => this.state.xScale(d.x))
      .y1(d => this.state.yScale(d.y))
      .y0(this.state.yScale(0));
    if (this.props.basisCurve) {
      areaGenerator.curve(curveBasis);
    }
    return (
      <g>
        {this.props.series.map(serie => (
          <path
            key={serie.name}
            className={classNames('line-chart-area', 'line-chart-area-' + serie.style)}
            d={areaGenerator(serie.data)}
          />
        ))}
      </g>
    );
  };

  renderEvents = () => {
    const { events, eventSize } = this.props;
    if (!events || !eventSize) {
      return null;
    }
    const { xScale, yScale } = this.state;
    const inRangeEvents = events.filter(
      event => event.date >= xScale.domain()[0] && event.date <= xScale.domain()[1]
    );
    const offset = eventSize / 2;
    return (
      <g>
        {inRangeEvents.map((event, idx) => (
          <path
            d={this.getEventMarker(eventSize)}
            className={classNames('line-chart-event', event.className)}
            key={`${idx}-${event.date.getTime()}`}
            transform={`translate(${xScale(event.date) - offset}, ${yScale.range()[0] + offset})`}
          />
        ))}
      </g>
    );
  };

  renderSelectedDate = () => {
    const { selectedDateIdx, selectedDateXPos, yScale } = this.state;
    const firstSerie = this.props.series[0];
    if (selectedDateIdx == null || selectedDateXPos == null || !firstSerie) {
      return null;
    }

    return (
      <g>
        <line
          className="line-tooltip"
          x1={selectedDateXPos}
          x2={selectedDateXPos}
          y1={yScale.range()[0]}
          y2={yScale.range()[1]}
        />
        {this.props.series.map(serie => {
          const point = serie.data[selectedDateIdx];
          if (!point || (!point.y && point.y !== 0)) {
            return null;
          }
          return (
            <circle
              key={serie.name}
              cx={selectedDateXPos}
              cy={yScale(point.y)}
              r="4"
              className={classNames('line-chart-dot', 'line-chart-dot-' + serie.style)}
            />
          );
        })}
      </g>
    );
  };

  renderClipPath = () => {
    return (
      <defs>
        <clipPath id="chart-clip">
          <rect width={this.state.xScale.range()[1]} height={this.state.yScale.range()[0] + 10} />
        </clipPath>
      </defs>
    );
  };

  renderMouseEventsOverlay = (zoomEnabled: boolean) => {
    const mouseEvents = {};
    if (zoomEnabled) {
      mouseEvents.onWheel = this.handleWheel;
    }
    if (this.props.updateSelectedDate) {
      mouseEvents.onMouseMove = this.handleMouseMove;
    }
    return (
      <rect
        className="chart-mouse-events-overlay"
        width={this.state.xScale.range()[1]}
        height={this.state.yScale.range()[0]}
        {...mouseEvents}
      />
    );
  };

  render() {
    if (!this.props.width || !this.props.height) {
      return <div />;
    }
    const zoomEnabled = !this.props.disableZoom && this.props.updateZoom != null;
    const isZoomed = this.props.startDate || this.props.endDate;
    return (
      <svg
        className={classNames('line-chart', { 'chart-zoomed': isZoomed })}
        width={this.props.width}
        height={this.props.height}>
        {zoomEnabled && this.renderClipPath()}
        <g transform={`translate(${this.props.padding[3]}, ${this.props.padding[0]})`}>
          {this.props.leakPeriodDate != null && this.renderLeak()}
          {!this.props.hideGrid && this.renderHorizontalGrid()}
          {!this.props.hideXAxis && this.renderXAxisTicks()}
          {this.props.showAreas && this.renderAreas()}
          {this.renderLines()}
          {this.props.showEventMarkers && this.renderEvents()}
          {this.renderSelectedDate()}
          {this.renderMouseEventsOverlay(zoomEnabled)}
        </g>
      </svg>
    );
  }
}
