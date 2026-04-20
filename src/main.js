import locale from './locale.js';
import {
  cardinalDirectionsIcon,
  weatherIcons,
  weatherIconsDay,
  weatherIconsNight
} from './const.js';
import {LitElement, html} from 'lit';
import {Chart, registerables} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
Chart.register(...registerables, ChartDataLabels);

class WeatherChartCard extends LitElement {

  static getStubConfig() {
    return {
      "show_main": true,
      "show_attributes": true
    };
  }

  static get properties() {
    return {
      _hass: {},
      config: {},
      language: {},
      sun: {type: Object},
      weather: {type: Object},
      temperature: {type: Object},
      humidity: {type: Object},
      pressure: {type: Object},
      windSpeed: {type: Object},
      windDirection: {type: Object},
      forecastChart: {type: Object},
      forecastItems: {type: Number},
      forecasts: {type: Array}
    };
  }

  setConfig(config) {
    const cardConfig = {
      icons_size: 25,
      show_celsius: false,
      ...config,
      forecast: {
        labels_font_size: 11,
        temperature1_color: 'rgba(255, 152, 0, 1.0)',
        temperature2_color: 'rgba(68, 115, 158, 1.0)',
        precipitation_color: 'rgba(132, 209, 253, 1.0)',
        condition_icons: true,
        ...config.forecast,
      },
      units: {
        pressure: 'hPa',
        speed: 'km/h',
        pressure_decimals: 1,
        ...config.units,
      }
    };
    this.config = cardConfig;
    if (!config.entity) {
      throw new Error('Please, define entity in the card config');
    };
  }

  set hass(hass) {
    this._hass = hass;
    this.language = hass.selectedLanguage || hass.language;
    this.sun = 'sun.sun' in hass.states ? hass.states['sun.sun'] : null;
    this.weather = this.config.entity in hass.states
      ? hass.states[this.config.entity] : null;
    if (this.weather) {
      this.temperature = (this.config.temp && this.config.temp in hass.states)
        ? parseFloat(hass.states[this.config.temp].state)
        : this.weather.attributes.temperature;
      this.humidity = this.weather.attributes.humidity;
      if (this.config.press && this.config.press in hass.states) {
        this.pressure = parseFloat(hass.states[this.config.press].state);
      } else {
        this.pressure = this.weather.attributes.pressure;
      }
      this.windSpeed = this.weather.attributes.wind_speed;
      this.windDirection = this.weather.attributes.wind_bearing;
    }

    if (this.weather && !this.forecastSubscriber) {
      this.subscribeForecastEvents();
    }
  }

  subscribeForecastEvents() {
    const forecastType = this.config.forecast.type || 'daily';
    const callback = (event) => {
      this.forecasts = event.forecast;
    };
    this.forecastSubscriber = this._hass.connection.subscribeMessage(callback, {
      type: 'weather/subscribe_forecast',
      forecast_type: forecastType,
      entity_id: this.config.entity,
    });
  }

  constructor() {
    super();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.forecastSubscriber) {
      this.forecastSubscriber.then((unsub) => unsub());
      this.forecastSubscriber = null;
    }
  }

  ll(str) {
    if (locale[this.language] === undefined) return locale.en[str];
    return locale[this.language][str];
  }

  getCardSize() {
    return 4;
  }

  getUnit(unit) {
    return this._hass.config.unit_system[unit] || '';
  }

  getWeatherIcon(condition, sun) {
    if (this.config.icons) {
      return `${this.config.icons}${
        sun == 'below_horizon'
        ? weatherIconsNight[condition]
        : weatherIconsDay[condition]}.svg`
    }
    return weatherIcons[condition];
  }

  getWindDirIcon(deg) {
    return cardinalDirectionsIcon[parseInt((deg + 22.5) / 45.0)];
  }

  getWindDir(deg) {
    return this.ll('cardinalDirections')[parseInt((deg + 11.25) / 22.5)];
  }

  firstUpdated() {
    this.measureCard();
    this.drawChart();
  }

  updated(changedProperties) {
    if (changedProperties.has('config')) {
      this.drawChart();
    }
    if (changedProperties.has('weather')) {
      if (this.forecastChart) this.updateChart();
    }
    if (changedProperties.has('forecasts')) {
      this.measureCard();
      if (this.forecastChart) {
        this.updateChart();
      } else {
        this.drawChart();
      }
    }
  }

  measureCard() {
    const card = this.shadowRoot.querySelector('ha-card');
    let fontSize = this.config.forecast.labels_font_size;
    if (!card) {
      return;
    }
    this.forecastItems = Math.round(card.offsetWidth / (fontSize * 5.5));
  }

  drawChart({config, language, weather, forecastItems} = this) {
    if (!weather || !weather.attributes || !this.forecasts || !this.forecasts.length) {
      return [];
    }
    if (this.forecastChart) {
      this.forecastChart.destroy();
    }
    var tempUnit = this._hass.config.unit_system.temperature;
    var lengthUnit = this._hass.config.unit_system.length;
    var precipUnit = lengthUnit === 'km' ? this.ll('units')['mm'] : this.ll('units')['in'];
    var forecast = this.forecasts.slice(0, forecastItems);
    if ((new Date(forecast[1].datetime) - new Date(forecast[0].datetime)) < 864e5)
      var mode = 'hourly';
    else
      var mode = 'daily';
    var i;
    var dateTime = [];
    var tempHigh = [];
    var tempLow = [];
    var precip = [];
    for (i = 0; i < forecast.length; i++) {
      var d = forecast[i];
      dateTime.push(d.datetime);
      tempHigh.push(d.temperature);
      if (typeof d.templow !== 'undefined') {
        tempLow.push(d.templow);
      }
      precip.push(d.precipitation);
    }
    var style = getComputedStyle(document.body);
    var backgroundColor = style.getPropertyValue('--card-background-color');
    var textColor = style.getPropertyValue('--primary-text-color');
    var dividerColor = style.getPropertyValue('--divider-color');
    const ctx = this.renderRoot.querySelector('#forecastChart').getContext('2d');

    Chart.defaults.color = textColor;
    Chart.defaults.scale.grid.color = dividerColor;
    Chart.defaults.elements.line.fill = false;
    Chart.defaults.elements.line.tension = 0.3;
    Chart.defaults.elements.line.borderWidth = 1.5;
    Chart.defaults.elements.point.radius = 2;
    Chart.defaults.elements.point.hitRadius = 10;

    this.forecastChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dateTime,
        datasets: [{
          label: this.ll('tempHi'),
          type: 'line',
          data: tempHigh,
          yAxisID: 'TempAxis',
          borderColor: config.forecast.temperature1_color,
          backgroundColor: config.forecast.temperature1_color,
        },
        {
          label: this.ll('tempLo'),
          type: 'line',
          data: tempLow,
          yAxisID: 'TempAxis',
          borderColor: config.forecast.temperature2_color,
          backgroundColor: config.forecast.temperature2_color,
        },
        {
          label: this.ll('precip'),
          type: 'bar',
          data: precip,
          yAxisID: 'PrecipAxis',
          borderColor: config.forecast.precipitation_color,
          backgroundColor: config.forecast.precipitation_color,
          barPercentage: 1.0,
          categoryPercentage: 1.0,
          datalabels: {
            display: function(context) {
              return context.dataset.data[context.dataIndex] > 0 ? 'auto' : false;
            },
            formatter: function(value, context) {
              if (context.dataset.data[context.dataIndex] > 9) {
                return Math.round(context.dataset.data[context.dataIndex]) + ' ' + precipUnit;
              }
              return context.dataset.data[context.dataIndex].toFixed(1) + ' ' + precipUnit;
            },
            align: 'top',
            anchor: 'start',
            offset: -8,
          }
        }]
      },
      options: {
        maintainAspectRatio: false,
        layout: {
          padding: {
            bottom: 10,
          }
        },
        scales: {
          DateTimeAxis: {
            position: 'top',
            grid: {
              drawBorder: false,
              drawTicks: false,
              zeroLineColor: dividerColor,
            },
            ticks: {
              maxRotation: 0,
              padding: 8,
              callback: function(value, index, values) {
                var datetime = this.getLabelForValue(value);
                var weekday = new Date(datetime).toLocaleDateString(language,
                  { weekday: 'short' });
                var time = new Date(datetime).toLocaleTimeString(language,
                  { hour12: false, hour: 'numeric', minute: 'numeric' });
                if (mode == 'hourly') {
                  return time;
                }
                return weekday;
              }
            }
          },
          TempAxis: {
            position: 'left',
            beginAtZero: false,
            suggestedMin: Math.min(...tempHigh, ...tempLow) - 5,
            suggestedMax: Math.max(...tempHigh, ...tempLow) + 3,
            grid: {
              display: false,
              drawBorder: false,
              drawTicks: false,
            },
            ticks: {
              display: false,
            }
          },
          PrecipAxis: {
            position: 'right',
            suggestedMax: lengthUnit === 'km' ? 20 : 1,
            grid: {
              display: false,
              drawBorder: false,
              drawTicks: false,
            },
            ticks: {
              display: false,
            }
          }
        },
        plugins: {
          legend: {
            display: false,
          },
          datalabels: {
            backgroundColor: backgroundColor,
            borderColor: context => context.dataset.backgroundColor,
            borderRadius: 8,
            borderWidth: 1.5,
            padding: 4,
            font: {
              size: config.forecast.labels_font_size,
              lineHeight: 0.7,
            },
            formatter: function(value, context) {
              return context.dataset.data[context.dataIndex] + '°';
            }
          },
          tooltip: {
            caretSize: 0,
            caretPadding: 15,
            callbacks: {
              title: function (TooltipItem) {
                var datetime = TooltipItem[0].label;
                return new Date(datetime).toLocaleDateString(language, {
                  month: 'short',
                  day: 'numeric',
                  weekday: 'short',
                  hour: 'numeric',
                  minute: 'numeric',
                });
              },
              label: function(context) {
                var label = context.dataset.label;
                var value = context.formattedValue;
                if (context.datasetIndex == 2) {
                  return label + ': ' + value + ' ' + precipUnit;
                }
                return label + ': ' + value + ' ' + tempUnit;
              }
            }
          }
        }
      }
    });
  }

  updateChart({weather, forecastItems, forecastChart} = this) {
    if (!weather || !weather.attributes || !this.forecasts || !this.forecasts.length) {
      return [];
    }
    var forecast = this.forecasts.slice(0, forecastItems);
    var i;
    var dateTime = [];
    var tempHigh = [];
    var tempLow = [];
    var precip = [];
    for (i = 0; i < forecast.length; i++) {
      var d = forecast[i];
      dateTime.push(d.datetime);
      tempHigh.push(d.temperature);
      if (typeof d.templow !== 'undefined') {
        tempLow.push(d.templow);
      }
      precip.push(d.precipitation);
    }
    if (forecastChart) {
      forecastChart.data.labels = dateTime;
      forecastChart.data.datasets[0].data = tempHigh;
      forecastChart.data.datasets[1].data = tempLow;
      forecastChart.data.datasets[2].data = precip;
      forecastChart.update();
    }
  }

  render({config, _hass, weather} = this) {
    if (!config || !_hass) {
      return html``;
    }
    if (!weather || !weather.attributes || !this.forecasts) {
      return html`
        <style>
          .card {
            padding-top: ${config.title? '0px' : '16px'};
            padding-right: 16px;
            padding-bottom: 16px;
            padding-left: 16px;
          }
        </style>
        <ha-card header="${config.title}">
          <div class="card">
            Please, check your weather entity
          </div>
        </ha-card>
      `;
    }
    return html`
      <style>
        ha-icon {
          color: var(--paper-item-icon-color);
        }
        img {
          width: ${config.icons_size}px;
          height: ${config.icons_size}px;
        }
        .card {
          padding-top: ${config.title ? '0px' : '16px'};
          padding-right: 16px;
          padding-bottom: 16px;
          padding-left: 16px;
        }
        .main {
          display: flex;
          align-items: center;
          font-size: 28px;
          margin-bottom: 10px;
        }
        .main ha-icon {
          --mdc-icon-size: 50px;
          margin-right: 14px;
        }
        .main img {
          width: ${config.icons_size * 2}px;
          height: ${config.icons_size * 2}px;
          margin-right: 14px;
        }
        .main div {
          line-height: 0.9;
        }
        .main span {
          font-size: 18px;
          color: var(--secondary-text-color);
        }
        .celsius-temp {
          margin-left: auto;
          font-size: 22px;
          line-height: 0.9;
          text-align: right;
        }
        .attributes {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .chart-container {
          position: relative;
          height: 180px;
          width: 100%;
        }
        .conditions {
          display: flex;
          justify-content: space-around;
          margin: 0px 5px 0px 5px;
          cursor: pointer;
        }
        .wind-details {
          display: flex;
          justify-content: space-around;
          margin: 2px 5px 0px 5px;
        }
        .wind-detail {
          display: flex;
          flex-direction: column;
          align-items: center;
          font-size: 11px;
        }
        .wind-detail ha-icon {
          --mdc-icon-size: 18px;
        }
      </style>

      <ha-card header="${config.title}">
        <div class="card">
          ${this.renderMain()}
          ${this.renderAttributes()}
          <div class="chart-container">
            <canvas id="forecastChart"></canvas>
          </div>
          ${this.renderForecastConditionIcons()}
          ${this.renderWind()}
        </div>
      </ha-card>
    `;
  }

  renderMain({config, sun, weather, temperature} = this) {
    if (config.show_main == false)
      return html``;
    let altTempHtml = html``;
    if (config.show_celsius) {
      const unit = this.getUnit('temperature');
      if (unit === '°F') {
        const c = ((temperature - 32) * 5 / 9).toFixed(1);
        altTempHtml = html`<div class="celsius-temp">${c}<span>°C</span></div>`;
      } else if (unit === '°C') {
        const f = (temperature * 9 / 5 + 32).toFixed(1);
        altTempHtml = html`<div class="celsius-temp">${f}<span>°F</span></div>`;
      }
    }
    return html`
      <div class="main">
        ${config.icons ?
          html`
            <img
              src="${this.getWeatherIcon(weather.state, sun.state)}"
              alt=""
            >
          `:
          html`
            <ha-icon icon="${this.getWeatherIcon(weather.state)}"></ha-icon>
          `
        }
        <div>
          <div>
            ${temperature}<span>
            ${this.getUnit('temperature')}</span>
          </div>
          <span>${this.ll(weather.state)}</span>
        </div>
        ${altTempHtml}
      </div>
    `;
  }

  renderAttributes({config, humidity, pressure, windSpeed, windDirection} = this) {
    if (this.unitSpeed === 'm/s') {
      windSpeed = Math.round(windSpeed * 1000 / 3600);
    }
    if (this.unitPressure === 'mmHg') {
      pressure = pressure * 0.75;
    }
    if (config.show_attributes == false)
      return html``;
    return html`
      <div class="attributes">
        <div>
          <ha-icon icon="hass:water-percent"></ha-icon> ${humidity} %<br>
          <ha-icon icon="hass:gauge"></ha-icon> ${Number(pressure).toFixed(config.units.pressure_decimals)} ${this.ll('units')[config.units.pressure] || config.units.pressure}
        </div>
        <div>
          ${this.renderSun()}
        </div>
        <div>
          <ha-icon icon="hass:${this.getWindDirIcon(windDirection)}"></ha-icon> ${this.getWindDir(windDirection)}<br>
          <ha-icon icon="hass:weather-windy"></ha-icon> ${windSpeed} ${this.ll('units')[config.units.speed] || config.units.speed}
        </div>
      </div>
    `;
  }

  renderSun({sun, language} = this) {
    if ( sun == undefined)
      return html``;
    return html`
      <ha-icon icon="mdi:weather-sunset-up"></ha-icon>
        ${new Date(sun.attributes.next_rising).toLocaleTimeString(language,
        {hour:'2-digit', minute:'2-digit'})}<br>
      <ha-icon icon="mdi:weather-sunset-down"></ha-icon>
        ${new Date(sun.attributes.next_setting).toLocaleTimeString(language,
        {hour:'2-digit', minute:'2-digit'})}
    `;
  }

  renderForecastConditionIcons({config, weather, forecastItems} = this) {
    const forecast = (this.forecasts || []).slice(0, forecastItems);
    if (config.forecast.condition_icons == false || !forecast.length)
      return html``;
    return html`
      <div
        class="conditions"
        @click="${(e) => this.showMoreInfo(config.entity)}"
      >
        ${forecast.map((item) => html`
          ${config.icons ?
            html`
              <img class="icon"
                src="${this.getWeatherIcon(item.condition)}"
                alt=""
              >
            `:
            html`
              <ha-icon icon="${this.getWeatherIcon(item.condition)}"></ha-icon>
            `
          }
        `)}
      </div>
    `;
  }

  renderWind({config, forecastItems} = this) {
    if (config.forecast.show_wind_forecast === false) return html``;
    const forecast = (this.forecasts || []).slice(0, forecastItems);
    if (!forecast.length) return html``;
    const windUnit = this.ll('units')[config.units.speed] || config.units.speed;
    return html`
      <div class="wind-details">
        ${forecast.map((item) => {
          let spd = item.wind_speed;
          const srcUnit = this.weather.attributes.wind_speed_unit;
          const tgt = config.units.speed;
          if (tgt && srcUnit && tgt !== srcUnit) {
            if (tgt === 'mph' && srcUnit === 'km/h') spd = spd / 1.60934;
            else if (tgt === 'mph' && srcUnit === 'm/s') spd = spd / 0.44704;
            else if (tgt === 'km/h' && srcUnit === 'mph') spd = spd * 1.60934;
            else if (tgt === 'km/h' && srcUnit === 'm/s') spd = spd * 3.6;
            else if (tgt === 'm/s' && srcUnit === 'mph') spd = spd * 0.44704;
            else if (tgt === 'm/s' && srcUnit === 'km/h') spd = spd / 3.6;
          }
          return html`
            <div class="wind-detail">
              <ha-icon icon="hass:${this.getWindDirIcon(item.wind_bearing)}"></ha-icon>
              <span>${Math.round(spd)} ${windUnit}</span>
            </div>
          `;
        })}
      </div>
    `;
  }

  _fire(type, detail, options) {
    const node = this.shadowRoot;
    options = options || {};
    detail = (detail === null || detail === undefined) ? {} : detail;
    const event = new Event(type, {
      bubbles: options.bubbles === undefined ? true : options.bubbles,
      cancelable: Boolean(options.cancelable),
      composed: options.composed === undefined ? true : options.composed
    });
    event.detail = detail;
    node.dispatchEvent(event);
    return event;
  }

  showMoreInfo(entity) {
    this._fire('hass-more-info', { entityId: entity });
  }
}

customElements.define('weather-chart-card', WeatherChartCard);
