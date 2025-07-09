import { Component, EventEmitter, OnInit, Inject, Output, OnDestroy } from '@angular/core';
import { AbstractControl, UntypedFormBuilder, UntypedFormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
//import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA, MatLegacyDialogRef as MatDialogRef } from '@angular/material/legacy-dialog';
import { Tag, Device } from '../../../_models/device';
import { Subject, takeUntil } from 'rxjs';
//import { TranslateService } from '@ngx-translate/core';

export interface TagProperty {
  device: Device;
  tag: Tag;
}

@Component({
  selector: 'app-tag-property-edit-fins',
  templateUrl: './tag-property-edit-fins.component.html',
  styleUrls: ['./tag-property-edit-fins.component.scss']
})
export class TagPropertyEditFinsComponent implements OnInit, OnDestroy {
  @Output() result = new EventEmitter<any>();
  formGroup: UntypedFormGroup;
  existingNames: string[] = [];
  error: string;
  private destroy$ = new Subject<void>();

  constructor(
    private fb: UntypedFormBuilder,
    public dialogRef: MatDialogRef<TagPropertyEditFinsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TagProperty
  ) {}

  ngOnInit(): void {
      const tag = this.data.tag;
      if (!tag) {
      console.error('[FINS] ❌ Tag data is undefined.');
      return;
  }
      this.formGroup = this.fb.group({
      deviceName: [{ value: this.data.device.name, disabled: true }, Validators.required],
      tagName: [tag.name, [Validators.required, this.validateName()]],
      tagType: [tag.type || 'Int16', Validators.required],
      tagAddress: [tag.address || 0, [Validators.required, Validators.min(0)]],
      tagMemoryAddress: [tag.memaddress || 'D', Validators.required],
      tagDivisor: [tag.divisor || 1],
      tagDescription: [tag.description || '']
    });
    
    // Update tagType based on tagMemoryAddress
    this.formGroup.controls.tagMemoryAddress.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(addr => {
        
        this.formGroup.controls.tagType.enable();
        if (!addr) {
          this.formGroup.controls.tagType.disable();
        } else if (addr === 'H' || addr === 'A') {
          this.formGroup.patchValue({ tagType: 'Bool' });
          this.formGroup.controls.tagType.disable();
          
        }
      });

    Object.keys(this.data.device.tags).forEach(key => {
      const existingTag = this.data.device.tags[key];
      if (existingTag.id && existingTag.id !== tag.id) {
        this.existingNames.push(existingTag.name);
      } else if (!existingTag.id && existingTag.name !== tag.name) {
        this.existingNames.push(existingTag.name);
      }
    });
     
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  validateName(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      this.error = null;
      const name = control?.value;
      if (this.existingNames.indexOf(name) !== -1) {
        return { name: 'Tag name already exists' };
      }
      if (name?.includes('@')) {
        return { name: 'Invalid character in tag name' };
      }
      return null;
    };
  }

  onOkClick(): void {
    if (this.formGroup.valid) {
      this.result.emit(this.formGroup.getRawValue());
    }
  }

  onNoClick(): void {
    this.dialogRef.close();
  }
}
