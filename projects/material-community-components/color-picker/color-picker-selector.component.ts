import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  Renderer2,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { Color, EMPTY_COLOR } from './color-picker.types';
import { TinyColor } from '@thebespokepixel/es-tinycolor';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { MccColorPickerCollectionService } from './color-picker-collection.service';
import { formatColor, parseColorString, toHex, toRgb } from './color-picker.utils';

interface Coordinates {
  x: number;
  y: number;
}

const INITIAL_COLOR: Color = new TinyColor('white');

@Component({
  selector: 'mcc-color-picker-selector',
  templateUrl: './color-picker-selector.component.html',
  styleUrls: ['./color-picker-selector.component.scss'],
  preserveWhitespaces: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MccColorPickerSelectorComponent implements AfterViewInit, OnInit, OnChanges, OnDestroy {
  /**
   * ElemenRef of the main color block
   */
  @ViewChild('block') _block: ElementRef;

  /**
   * ElemenRef of the pointer main color
   */
  @ViewChild('blockPointer') _bp: ElementRef;

  /**
   * Canvas of the block
   */
  @ViewChild('blockCanvas')
  private _bc: ElementRef;
  private _blockContext: CanvasRenderingContext2D;

  /**
   * ElementRef of the color base
   */
  @ViewChild('hueSelector') _hueSelector: ElementRef;
  // hold _strip context
  private _hueSelectorContext: any;

  /**
   * Container of the strip
   */
  @ViewChild('hueContainer')
  set hueContainer(el: ElementRef) {
    this._sc = el;
  }

  private _sc: ElementRef;

  /**
   * ElementRef of the alpha base
   */
  @ViewChild('alpha') _alpha: ElementRef;
  // hold _alpha context
  private _alphaContext: CanvasRenderingContext2D;

  /**
   * Container of the alpha
   */
  @ViewChild('alphaContainer')
  private _ac: ElementRef;

  /**
   * Change height base of the selector
   */
  @Input()
  set height(value: number) {
    this._height = value;
  }
  get height(): number {
    return this._height;
  }
  private _height: number = 170;
  static ngAcceptInputType_height: number | string;

  get stripHeight(): number {
    return this._height - 10;
  }

  /**
   * Receive selected color from the component
   */
  @Input()
  set selectedColor(value: string) {
    if (value === this.emptyColor) {
      this.noColor = true;
      // use "EMPTY_COLOR" as real color if it can be parsed as such
      this._selectedColor = parseColorString(this.emptyColor) || INITIAL_COLOR;
    } else {
      const color: Color = parseColorString(value);
      if (color) {
        this._selectedColor = color.setAlpha(color['_roundA']);
        this.noColor = false;
      }
    }
  }

  private _selectedColor: Color = INITIAL_COLOR;

  /**
   * Hide the hexadecimal color forms.
   */
  @Input()
  set hideHexForms(value: boolean) {
    this._hideHexForms = value;
  }
  get hideHexForms(): boolean {
    return this._hideHexForms;
  }
  private _hideHexForms: boolean = false;

  /**
   * Emit update when a color is selected
   */
  @Output()
  private readonly changeSelectedColor = new EventEmitter<string>();

  /**
   * Subject of the current selected color by the user
   */
  private _tmpSelectedColor: BehaviorSubject<Color> = new BehaviorSubject<Color>(this._selectedColor);

  /**
   * Subscription of the tmpSelectedColor Observable
   */
  private _tmpSelectedColorSub: Subscription;

  /**
   * Subscription of the hexForm values change
   */
  private _hexValuesSub: Subscription;

  /**
   * Subscription of the rbgForm values change
   */
  private _rgbValuesSub: Subscription;

  /**
   * Handle color of the form inputs text
   */
  textClass: string = 'black';

  /**
   * Keeps track if the mouse button is pressed
   */
  _isPressed: boolean = false;

  /**
   * Form of the color in hex
   */
  hexForm: FormGroup;

  /**
   * Form and keys of the fields in RGB
   */
  rgbaForm: FormGroup;

  /**
   * Last remembered coordinates in block selector
   */
  private _latestBlockCoordinates: Coordinates;

  /**
   * True if empty color is selected
   */
  noColor: boolean;

  /**
   * keeping track of the rectangular position on page of the current selection target
   */
  private _selectionTargetPosition: any;

  /**
   * keeping mousedown listeners for destruction
   */
  private _mouseDownListeners: Array<() => void> = [];

  /**
   * keeping track of temporary mouse listeners for destruction
   */
  private _temporaryMouseListeners: Array<() => void> = [];

  get selectorWidth(): number {
    return this._selectorWidth;
  }

  private _selectorWidth: number = 240;

  get stripWidth(): number {
    return this._stripWidth;
  }

  private _stripWidth: number = 20;

  get tmpSelectedColorAsRgba$(): Observable<string> {
    return this._tmpSelectedColor.asObservable().pipe(map(toRgb), distinctUntilChanged());
  }

  constructor(
    private formBuilder: FormBuilder,
    private renderer: Renderer2,
    public colorPickerCollectionService: MccColorPickerCollectionService,
    @Inject(EMPTY_COLOR) private emptyColor: string
  ) {}

  ngOnInit() {
    // set initial position for selection block
    this._latestBlockCoordinates = { x: this._selectorWidth - 1, y: Math.floor(this._height / 2) };

    // set selectedColor initial value
    this._tmpSelectedColor.next(this._selectedColor);

    this._tmpSelectedColorSub = this._tmpSelectedColor.subscribe(color => {
      this.textClass = color.isDark() && color.getAlpha() > 0.3 ? 'white' : 'black';
      // right now using hex for non alpha and rgba for alpha colors
      if (this.noColor) {
        this.changeSelectedColor.emit(this.emptyColor);
        this.colorPickerCollectionService.changeSelectedColor(this.emptyColor);
      } else {
        const clr = formatColor(color, this.colorPickerCollectionService.format);
        this.changeSelectedColor.emit(clr);
        this.colorPickerCollectionService.changeSelectedColor(clr);
      }
    });

    // hex form
    this.hexForm = this.formBuilder.group({
      hexCode: new FormControl(toHex(this._selectedColor), {
        validators: [Validators.pattern(/^#([0-9A-F]{8}|[0-9A-F]{6})$/gi)],
        updateOn: 'change'
      })
    });

    // rgb form
    const rgbKeys = ['R', 'G', 'B'];
    const rgbaGroup: { [key: string]: FormControl } = {};
    const rgb = this._selectedColor.toRgb();
    const rgbValues = [rgb.r, rgb.g, rgb.b, rgb.a];
    rgbKeys.forEach(
      (key, index) =>
        (rgbaGroup[key] = new FormControl(rgbValues[index], {
          validators: [Validators.min(0), Validators.max(255), Validators.required],
          updateOn: 'change'
        }))
    );

    // add alpha input to rgb form
    rgbaGroup['A'] = new FormControl(this._selectedColor.getAlpha(), {
      validators: [Validators.min(0), Validators.max(1), Validators.required]
    });

    this.rgbaForm = this.formBuilder.group(rgbaGroup);

    this._watchFormChanges();
  }

  /**
   * Update forms and selectors selectedColor change and
   * the mouse button is not pressed
   */
  ngOnChanges(changes: SimpleChanges) {
    if ('selectedColor' in changes) {
      if (!this._isPressed) {
        const color = this._selectedColor;
        this._updateHexForm(color);
        this._updateRGBAForm(color);
        this.setSelectorPositions(color);
        this._drawBlockSelector(color);
        if (this.colorPickerCollectionService.alpha) {
          this._drawAlphaSelector(color);
        }
        this._tmpSelectedColor.next(color);
      }
    }
  }

  ngOnDestroy() {
    // destroy listeners
    this._mouseDownListeners.forEach(listener => listener());
    this._temporaryMouseListeners.forEach(listener => listener());

    // unsubscribe
    if (this._tmpSelectedColorSub && !this._tmpSelectedColorSub.closed) {
      this._tmpSelectedColorSub.unsubscribe();
    }
    if (this._hexValuesSub && !this._hexValuesSub.closed) {
      this._hexValuesSub.unsubscribe();
    }
    if (this._rgbValuesSub && !this._rgbValuesSub.closed) {
      this._rgbValuesSub.unsubscribe();
    }
  }

  ngAfterViewInit() {
    // draw initial selectors and listen to mouse events

    this._mouseDownListeners.push(
      this.renderer.listen(this._block.nativeElement, 'touchstart', (e: TouchEvent) => {
        if (e.cancelable) {
          e.preventDefault();
          this._isPressed = true;
          this._selectionTargetPosition = this._block.nativeElement.getBoundingClientRect();
          this._listenToMouseForBlock();
          const x = e.targetTouches[0].clientX - this._selectionTargetPosition.x;
          const y = e.targetTouches[0].clientY - this._selectionTargetPosition.y;
          this.changeColor({ x: x, y: y });
        }
      })
    );

    this._mouseDownListeners.push(
      this.renderer.listen(this._block.nativeElement, 'mousedown', (e: MouseEvent) => {
        e.preventDefault();
        this._isPressed = true;
        this._selectionTargetPosition = this._block.nativeElement.getBoundingClientRect();
        this._listenToMouseForBlock();
        this.changeColor({ x: e.offsetX, y: e.offsetY });
      })
    );

    this._blockContext = this._bc.nativeElement.getContext('2d');
    this._blockContext.rect(0, 0, this._bc.nativeElement.width, this._bc.nativeElement.height);

    this._mouseDownListeners.push(
      this.renderer.listen(this._hueSelector.nativeElement, 'touchstart', (e: TouchEvent) => {
        if (e.cancelable) {
          e.preventDefault();
          this._isPressed = true;
          this._selectionTargetPosition = this._hueSelector.nativeElement.getBoundingClientRect();
          this._listenToMouseForHue();
          const y = e.targetTouches[0].clientY - this._selectionTargetPosition.y;
          this.changeHue(y);
        }
      })
    );

    this._mouseDownListeners.push(
      this.renderer.listen(this._hueSelector.nativeElement, 'mousedown', (e: MouseEvent) => {
        e.preventDefault();
        this._isPressed = true;
        this._selectionTargetPosition = this._hueSelector.nativeElement.getBoundingClientRect();
        this._listenToMouseForHue();
        this.changeHue(e.offsetY);
      })
    );

    if (this.colorPickerCollectionService.alpha) {
      this._drawAlphaSelector(this._selectedColor);

      this._mouseDownListeners.push(
        this.renderer.listen(this._alpha.nativeElement, 'touchstart', (e: TouchEvent) => {
          if (e.cancelable) {
            e.preventDefault();
            this._isPressed = true;
            this._selectionTargetPosition = this._alpha.nativeElement.getBoundingClientRect();
            this._listenToMouseForAlpha();
            const y = e.targetTouches[0].clientY - this._selectionTargetPosition.y;
            this.changeAlpha(y);
          }
        })
      );

      this._mouseDownListeners.push(
        this.renderer.listen(this._alpha.nativeElement, 'mousedown', (e: MouseEvent) => {
          e.preventDefault();
          this._isPressed = true;
          this._selectionTargetPosition = this._alpha.nativeElement.getBoundingClientRect();
          this._listenToMouseForAlpha();
          this.changeAlpha(e.offsetY);
        })
      );
      this._alphaContext = this._alpha.nativeElement.getContext('2d');
    }

    this._drawHueSelector();
    this._drawBlockSelector(this._selectedColor);

    if (this.colorPickerCollectionService.alpha) {
      this._drawAlphaSelector(this._selectedColor);
    }

    this.setSelectorPositions(this._selectedColor);
  }

  private _listenToMouseForBlock() {
    this._preventTextSelection();

    this._temporaryMouseListeners.push(
      this.renderer.listen(this._block.nativeElement, 'touchmove', (e: TouchEvent) => {
        if (e.cancelable) {
          e.preventDefault();
          const coords = this._getCoordinatesForPosition(e.targetTouches[0].clientX, e.targetTouches[0].clientY);
          this.changeColor(coords);
        }
      })
    );

    this._temporaryMouseListeners.push(
      this.renderer.listen(this._block.nativeElement, 'mousemove', (e: MouseEvent) => {
        if (e.buttons === 1) {
          this.changeColor({ x: e.offsetX, y: e.offsetY });
        }
      })
    );

    this._registerMouseUpListeners();

    this._temporaryMouseListeners.push(
      this.renderer.listen(document, 'mousemove', (e: MouseEvent) => {
        if (this._isPressed && e.target !== this._block.nativeElement) {
          const coords = this._getCoordinatesForPosition(e.clientX, e.clientY);
          this.changeColor(coords);
        }
      })
    );
  }

  private _listenToMouseForHue() {
    this._preventTextSelection();

    this._temporaryMouseListeners.push(
      this.renderer.listen(this._hueSelector.nativeElement, 'touchmove', (e: TouchEvent) => {
        if (e.cancelable) {
          e.preventDefault();
          const y = this._getYForPosition(e.targetTouches[0].clientY);
          this.changeHue(y);
        }
      })
    );

    this._temporaryMouseListeners.push(
      this.renderer.listen(this._hueSelector.nativeElement, 'mousemove', (e: MouseEvent) => {
        if (e.buttons === 1) {
          this.changeHue(e.offsetY);
        }
      })
    );

    this._registerMouseUpListeners();

    this._temporaryMouseListeners.push(
      this.renderer.listen(document, 'mousemove', (e: MouseEvent) => {
        if (this._isPressed && e.target !== this._hueSelector.nativeElement) {
          const y = this._getYForPosition(e.clientY);
          this.changeHue(y);
        }
      })
    );
  }

  private _listenToMouseForAlpha() {
    this._preventTextSelection();

    this._temporaryMouseListeners.push(
      this.renderer.listen(this._alpha.nativeElement, 'touchmove', (e: TouchEvent) => {
        if (e.cancelable) {
          e.preventDefault();
          const y = this._getYForPosition(e.targetTouches[0].clientY);
          this.changeAlpha(y);
        }
      })
    );

    this._temporaryMouseListeners.push(
      this.renderer.listen(this._alpha.nativeElement, 'mousemove', (e: MouseEvent) => {
        if (e.buttons === 1) {
          this.changeAlpha(e.offsetY);
        }
      })
    );
    this._registerMouseUpListeners();

    this._temporaryMouseListeners.push(
      this.renderer.listen(document, 'mousemove', (e: MouseEvent) => {
        if (this._isPressed && e.target !== this._alpha.nativeElement) {
          const y = this._getYForPosition(e.clientY);
          this.changeAlpha(y);
        }
      })
    );
  }

  private _preventTextSelection() {
    this._temporaryMouseListeners.push(
      this.renderer.listen(document, 'selectstart', (e: Event) => {
        e.preventDefault();
      })
    );
  }

  private _registerMouseUpListeners() {
    this._temporaryMouseListeners.push(
      this.renderer.listen(document, 'touchend', (e: TouchEvent) => {
        if (e.cancelable) {
          e.preventDefault();
          this._isPressed = false;
          this._temporaryMouseListeners.forEach(listener => listener());
        }
      })
    );

    this._temporaryMouseListeners.push(
      this.renderer.listen(document, 'mouseup', (e: MouseEvent) => {
        e.preventDefault();
        this._isPressed = false;
        this._temporaryMouseListeners.forEach(listener => listener());
      })
    );
  }

  private _getCoordinatesForPosition(clientX: number, clientY: number): Coordinates {
    let x: number;
    if (clientX < this._selectionTargetPosition.left) {
      x = 0;
    } else if (clientX > this._selectionTargetPosition.right) {
      x = this._selectionTargetPosition.width;
    } else {
      x = clientX - this._selectionTargetPosition.left;
    }
    let y: number;
    if (clientY < this._selectionTargetPosition.top) {
      y = 0;
    } else if (clientY > this._selectionTargetPosition.bottom) {
      y = this._selectionTargetPosition.height;
    } else {
      y = clientY - this._selectionTargetPosition.top;
    }

    return { x, y };
  }

  private _getYForPosition(clientY: number): number {
    let y: number;
    if (clientY < this._selectionTargetPosition.top) {
      y = 0;
    } else if (clientY > this._selectionTargetPosition.bottom) {
      y = this._selectionTargetPosition.height;
    } else {
      y = clientY - this._selectionTargetPosition.top;
    }
    return y;
  }

  private _drawHueSelector() {
    this._hueSelectorContext = this._hueSelector.nativeElement.getContext('2d');
    this._hueSelectorContext.rect(0, 0, this._hueSelector.nativeElement.width, this._hueSelector.nativeElement.height);

    const grd1 = this._hueSelectorContext.createLinearGradient(0, 0, 0, this._bc.nativeElement.height);
    grd1.addColorStop(0, 'hsl(0, 100%, 50%)');
    grd1.addColorStop(0.125, 'hsl(45, 100%, 50%)');
    grd1.addColorStop(0.25, 'hsl(90, 100%, 50%)');
    grd1.addColorStop(0.375, 'hsl(135, 100%, 50%)');
    grd1.addColorStop(0.5, 'hsl(180, 100%, 50%)');
    grd1.addColorStop(0.625, 'hsl(225, 100%, 50%)');
    grd1.addColorStop(0.75, 'hsl(270, 100%, 50%)');
    grd1.addColorStop(0.875, 'hsl(315, 100%, 50%)');
    grd1.addColorStop(1, 'hsl(360, 100%, 50%)');
    this._hueSelectorContext.fillStyle = grd1;
    this._hueSelectorContext.fill();
  }

  /**
   * Generate alpha selector gradient based on the RGB color
   */
  private _drawAlphaSelector(color: Color) {
    if (this._alphaContext) {
      this._alphaContext.clearRect(0, 0, this._alpha.nativeElement.width, this._alpha.nativeElement.height);

      const alphaGrd2 = this._alphaContext.createLinearGradient(0, 0, 0, this._bc.nativeElement.height);
      alphaGrd2.addColorStop(0, `rgba(${color.toRgb().r}, ${color.toRgb().g}, ${color.toRgb().b}, 1)`);
      alphaGrd2.addColorStop(1, `rgba(${color.toRgb().r}, ${color.toRgb().g}, ${color.toRgb().b}, 0)`);

      this._alphaContext.fillStyle = alphaGrd2;
      this._alphaContext.fillRect(0, 0, this._alpha.nativeElement.width, this._alpha.nativeElement.height);
    }
  }

  /**
   * Generate color selector block based on the RGB color
   */
  private _drawBlockSelector(hueColor: Color) {
    if (this._blockContext) {
      this._blockContext.fillStyle = `hsl(${hueColor.toHsl().h}, 100%, 50%)`;
      this._blockContext.fillRect(0, 0, this._bc.nativeElement.width, this._bc.nativeElement.height);

      // HSL selector
      const grdWhite = this._hueSelectorContext.createLinearGradient(1, 0, this._bc.nativeElement.width - 1, 0);
      grdWhite.addColorStop(0, 'rgba(255,255,255,1)');
      grdWhite.addColorStop(1, 'rgba(255,255,255,0)');
      this._blockContext.fillStyle = grdWhite;
      this._blockContext.fillRect(0, 0, this._bc.nativeElement.width, this._bc.nativeElement.height);

      const grdBlack = this._hueSelectorContext.createLinearGradient(0, 1, 0, this._bc.nativeElement.height - 1);
      grdBlack.addColorStop(0, 'rgba(0,0,0,0)');
      grdBlack.addColorStop(1, 'rgba(0,0,0,1)');
      this._blockContext.fillStyle = grdBlack;
      this._blockContext.fillRect(0, 0, this._bc.nativeElement.width, this._bc.nativeElement.height);
    }
  }

  /**
   * Watch changes on forms
   */
  private _watchFormChanges() {
    this._hexValuesSub = this.hexForm.valueChanges.subscribe(value => {
      if (this.hexForm.valid) {
        const color: Color = new TinyColor(value.hexCode);
        this._updateRGBAForm(color);
        this._drawBlockSelector(color);
        if (this.colorPickerCollectionService.alpha) {
          this._drawAlphaSelector(color);
        }
        this.setSelectorPositions(color);
        this._tmpSelectedColor.next(color);
      }
    });

    this._rgbValuesSub = this.rgbaForm.valueChanges.subscribe(rgba => {
      if (this.rgbaForm.valid) {
        const color: Color = new TinyColor({ r: rgba.R, g: rgba.G, b: rgba.B, a: rgba.A });
        this._updateHexForm(color);
        this._drawBlockSelector(color);
        if (this.colorPickerCollectionService.alpha) {
          this._drawAlphaSelector(color);
        }
        this.setSelectorPositions(color);
        this._tmpSelectedColor.next(color);
      }
    });
  }

  /**
   * Update RGBA form
   */
  private _updateRGBAForm(color: Color) {
    if (!this.rgbaForm) {
      return;
    }
    const values = { R: color.toRgb().r, G: color.toRgb().g, B: color.toRgb().b, A: color.toRgb().a };
    this.rgbaForm.setValue(values, { emitEvent: false });
  }

  /**
   * Update hex form
   */
  private _updateHexForm(color: Color) {
    if (!this.hexForm) {
      return;
    }

    const hex = toHex(color);
    const control = this.hexForm.get('hexCode');
    control.setValue(hex, { emitEvent: false, onlySelf: true });
    control.updateValueAndValidity({ emitEvent: false, onlySelf: true });
  }

  /**
   * Handle changes of the hue slider
   */
  private changeHue(y: number) {
    if (y <= this.stripHeight) {
      this.setHueSelector(y);
      const data = this._hueSelectorContext.getImageData(this.stripWidth / 2, y, 1, 1).data;
      const color: Color = new TinyColor({ r: data[0], g: data[1], b: data[2] });
      this._drawBlockSelector(color);
      this.changeColor();
    }
  }

  /**
   * Handle changes of the alpha slider
   */
  private changeAlpha(y: number) {
    if (y <= this.stripHeight) {
      this.setAlphaSelector(y);
      const alpha = Number(((this.stripHeight - y) / this.stripHeight).toFixed(2));

      const color = this._selectedColor.clone().setAlpha(alpha);
      this._updateRGBAForm(color);
      this._updateHexForm(color);
      this.noColor = false;
      this._tmpSelectedColor.next(color);
    }
  }

  /**
   * Handle changes of the selected color in the XY block
   */
  private changeColor(offsets?: Coordinates) {
    const os = offsets || this._latestBlockCoordinates;
    if (os.x <= this._selectorWidth && os.y <= this._height) {
      this.setXYSelector(os);

      const data: Uint8ClampedArray = this._blockContext.getImageData(os.x ? os.x - 1 : os.x, os.y ? os.y - 1 : os.y, 1, 1).data;
      const color: Color = new TinyColor({ r: data[0], g: data[1], b: data[2], a: this._selectedColor.getAlpha() });
      this._updateRGBAForm(color);
      this._updateHexForm(color);
      if (this.colorPickerCollectionService.alpha) {
        this._drawAlphaSelector(color);
      }
      this.noColor = false;
      this._tmpSelectedColor.next(color);
    }
  }

  /**
   * Set all selectors positions based on a color
   */
  private setSelectorPositions(color: Color) {
    const offset = this.getHueOffsets(color);
    this.setHueSelector(offset);

    const offsets = this.getXYOffsets(color);
    this.setXYSelector(offsets);

    const alphaOffset = this.getAlphaOffset(color);
    this.setAlphaSelector(alphaOffset);
  }

  /**
   * Set block selector positions in view
   */
  private setXYSelector(offsets: Coordinates) {
    if (this._bp) {
      this.renderer.setStyle(this._bp.nativeElement, 'transform', `translate(${offsets.x - 6}px, ${offsets.y - 6}px)`);
      this._latestBlockCoordinates = offsets;
    }
  }

  /**
   * Set hue selector positions in view
   */
  private setHueSelector(offset: number) {
    if (this._sc) {
      this.renderer.setStyle(this._sc.nativeElement, 'background-position-y', `${offset}px`);
    }
  }

  /**
   * Set alpha selector positions in view
   */
  private setAlphaSelector(offset: number) {
    if (this._ac) {
      this.renderer.setStyle(this._ac.nativeElement, 'background-position-y', `${offset}px`);
    }
  }

  /**
   * Get the X and Y coordinates for the block selector relative to it's size
   */
  private getXYOffsets(color: Color): Coordinates {
    const hsv = color.toHsv();

    const x = this._selectorWidth * hsv.s;
    const y = this._height - this._height * hsv.v;
    return { x, y };
  }

  /**
   * Get the Y coordinate for the hue selector relative to it's height
   */
  private getHueOffsets(color: Color): number {
    return (this.stripHeight / 360) * color.toHsl().h;
  }

  /**
   * Get the Y coordinate for the alpha selector relative to it's height
   */
  private getAlphaOffset(color: Color): number {
    return this.stripHeight - this.stripHeight * color.getAlpha();
  }
}
