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
import BubblePopup from '../../../components/common/BubblePopup';
import FormattedDate from '../../../components/ui/FormattedDate';
import GraphsTooltipsOverview from './GraphsTooltipsOverview';
import type { Serie } from '../../../components/charts/AdvancedTimeline';

type Props = {
  formatValue: (number | string) => string,
  graphWidth: number,
  selectedDate: Date,
  series: Array<Serie & { translatedName: string }>,
  tooltipIdx: number,
  tooltipPos: number
};

const TOOLTIP_WIDTH = 250;

export default class GraphsTooltips extends React.PureComponent {
  props: Props;

  render() {
    const top = 50;
    let left = this.props.tooltipPos + 60;
    let customClass;
    if (left > this.props.graphWidth - TOOLTIP_WIDTH - 50) {
      left -= TOOLTIP_WIDTH;
      customClass = 'bubble-popup-right';
    }
    return (
      <BubblePopup customClass={customClass} position={{ top, left, width: TOOLTIP_WIDTH }}>
        <div className="project-activity-graph-tooltip">
          <div className="project-activity-graph-tooltip-title spacer-bottom">
            <FormattedDate date={this.props.selectedDate.valueOf()} format="LL" />
          </div>
          <table>
            <tbody>
              {this.props.series.map(serie => {
                const point = serie.data[this.props.tooltipIdx];
                if (!point || (!point.y && point.y !== 0)) {
                  return null;
                }
                return (
                  <GraphsTooltipsOverview
                    key={serie.name}
                    serie={serie}
                    value={this.props.formatValue(point.y)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </BubblePopup>
    );
  }
}
