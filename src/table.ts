import { Signal, ISignal } from '@lumino/signaling';
import {
  DataGrid,
  JSONModel,
  BasicKeyHandler,
  BasicMouseHandler,
  BasicSelectionModel
} from '@lumino/datagrid';
import { ITimeMeasurement } from './benchmark';
import { IRuleDescription } from './css';

import { Statistic } from './statistics';

class MouseHandler extends BasicMouseHandler {
  get clicked(): ISignal<this, DataGrid.HitTestResult> {
    return this._clicked;
  }

  onMouseDown(grid: DataGrid, event: MouseEvent): void {
    const { clientX, clientY } = event;
    const hit = grid.hitTest(clientX, clientY);
    this._lastMouseDownHit = hit;
    super.onMouseDown(grid, event);
  }

  onMouseUp(grid: DataGrid, event: MouseEvent): void {
    const lastHit = this._lastMouseDownHit;
    if (lastHit) {
      const { clientX, clientY } = event;
      const hit = grid.hitTest(clientX, clientY);

      if (lastHit.column === hit.column && lastHit.row === hit.row) {
        this._clicked.emit(hit);
      }
    }

    super.onMouseUp(grid, event);
  }

  private _clicked = new Signal<this, DataGrid.HitTestResult>(this);
  private _lastMouseDownHit: DataGrid.HitTestResult | null = null;
}

export abstract class ResultTable extends DataGrid {
  abstract readonly columnWidths: Record<string, number>;
  columnNames: string[];

  constructor() {
    super();
    this.keyHandler = new BasicKeyHandler();
    const mouseHandler = new MouseHandler();
    this.mouseHandler = mouseHandler;
    this.columnNames = [];
    mouseHandler.clicked.connect((_, hit) => {
      this.handleClick(hit);
    });
  }

  abstract handleClick(hit: DataGrid.HitTestResult): void;

  protected setupColumnWidths(): void {
    this.fitColumnNames('all');
    for (const [name, size] of Object.entries(this.columnWidths)) {
      const index = this.columnNames.indexOf(name);
      if (index !== -1) {
        this.resizeColumn('body', index, size);
      }
    }
  }
}

interface ITimingTableOptions {
  measurements: ITimeMeasurement[];
  reference?: number[];
  stateSource: any;
  /**
   * Worse results will be shown at the top of the table.
   */
  lowerIsBetter: boolean;
  sortColumn?: string;
}

export class TimingTable extends ResultTable {
  readonly columnWidths = {
    source: 425,
    content: 100,
    selector: 175,
    rulesInBlock: 450,
    IQM: 45,
    min: 45,
    Δ: 45,
    name: 150,
    resource: 500
  };
  stateSource: any;
  constructor(options: ITimingTableOptions) {
    super();
    this.stateSource = options.stateSource;
    const referenceIQM = options.reference
      ? Statistic.interQuartileMean(options.reference)
      : null;
    const anyErrors = options.measurements.some(
      result => result.errors != null && result.errors.length !== 0
    );
    const results = options.measurements.map(result => {
      // Make a copy
      result = { ...result };
      // https://github.com/jupyterlab/lumino/issues/448
      if (result['content']) {
        result['content'] = result['content'].substring(0, 500);
      }
      result['times'] = result.times.map(t => Statistic.round(t, 1));
      result['min'] = Statistic.round(Statistic.min(result.times), 1);
      result['mean'] = Statistic.round(Statistic.mean(result.times), 1);
      result['IQM'] = Statistic.round(
        Statistic.interQuartileMean(result.times),
        1
      );
      if (referenceIQM !== null) {
        result['Δ'] = Statistic.round(
          Statistic.interQuartileMean(result.times) - referenceIQM,
          1
        );
      }
      if (result.source) {
        result['source'] = result['source'].replace('webpack://./', '');
      }
      if (result['totalTime']) {
        result['totalTime'] = Statistic.round(result.totalTime, 1);
      }
      if (result['rulesInBlock']) {
        result['rulesInBlock'] = (
          result['rulesInBlock'] as IRuleDescription[]
        ).map(rule => {
          return rule.selector;
        });
      }
      if (!anyErrors) {
        delete result['errors'];
      }
      return result;
    });
    const first = results[0];
    if (!first) {
      throw new Error('No results to create a table!');
    }
    this.results = results;
    this.columnNames = Object.keys(first);
    this.sortColumn = options.sortColumn || 'IQM';
    this.sortOrder = options.lowerIsBetter ? 'ascending' : 'descending';
    this._setupDataModel();
  }

  private _setupDataModel() {
    const sort =
      this.sortOrder === 'ascending'
        ? ((a: ITimeMeasurement, b: ITimeMeasurement) =>
            b[this.sortColumn] - a[this.sortColumn]).bind(this)
        : ((a: ITimeMeasurement, b: ITimeMeasurement) =>
            a[this.sortColumn] - b[this.sortColumn]).bind(this);
    this.dataModel = new JSONModel({
      data: this.results.sort(sort),
      schema: {
        fields: this.columnNames.map(key => {
          return {
            name: key,
            type: 'string'
          };
        })
      }
    });
    this.selectionModel = new BasicSelectionModel({
      dataModel: this.dataModel
    });
    this.setupColumnWidths();
  }

  handleClick(hit: DataGrid.HitTestResult): void {
    if (hit.region === 'column-header') {
      const newSortColumn = this.dataModel!.data(
        hit.region,
        hit.row,
        hit.column
      );
      if (newSortColumn === this.sortColumn) {
        this.sortOrder =
          this.sortOrder === 'ascending' ? 'descending' : 'ascending';
      } else {
        this.sortColumn = newSortColumn;
      }
      this._setupDataModel();
      this.update();
    }
  }
  protected results: ITimeMeasurement[];
  protected sortColumn: string;
  protected sortOrder: 'ascending' | 'descending' = 'ascending';
}
