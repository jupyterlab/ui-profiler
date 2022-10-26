/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import React from 'react';
import { ITranslator } from '@jupyterlab/translation';
import {
  ArrayFieldTemplateProps,
  FieldTemplateProps,
  ObjectFieldTemplateProps,
  utils
} from '@rjsf/core';

// TODO export those templates upstream to avoid copy-pasting them
// TODO stop relying on settings to get defaults?

/**
 * Template to allow for custom buttons to re-order/remove entries in an array.
 * Necessary to create accessible buttons.
 */
export const CustomArrayTemplateFactory = (
  translator: ITranslator
): React.FC<ArrayFieldTemplateProps> => {
  const trans = translator.load('jupyterlab');

  const factory = (props: ArrayFieldTemplateProps) => {
    return (
      <div className={props.className}>
        <props.TitleField
          title={props.title}
          required={props.required}
          id={`${props.idSchema.$id}-title`}
        />
        <props.DescriptionField
          id={`${props.idSchema.$id}-description`}
          description={props.schema.description ?? ''}
        />
        {props.items.map(item => {
          return (
            <div key={item.key} className={item.className}>
              {item.children}
              <div className="jp-ArrayOperations">
                <button
                  className="jp-mod-styled jp-mod-reject"
                  onClick={item.onReorderClick(item.index, item.index - 1)}
                  disabled={!item.hasMoveUp}
                >
                  {trans.__('Move Up')}
                </button>
                <button
                  className="jp-mod-styled jp-mod-reject"
                  onClick={item.onReorderClick(item.index, item.index + 1)}
                  disabled={!item.hasMoveDown}
                >
                  {trans.__('Move Down')}
                </button>
                <button
                  className="jp-mod-styled jp-mod-warn"
                  onClick={item.onDropIndexClick(item.index)}
                  disabled={!item.hasRemove}
                >
                  {trans.__('Remove')}
                </button>
              </div>
            </div>
          );
        })}
        {props.canAdd && (
          <button
            className="jp-mod-styled jp-mod-reject"
            onClick={props.onAddClick}
          >
            {trans.__('Add')}
          </button>
        )}
      </div>
    );
  };
  factory.displayName = 'JupyterLabArrayTemplate';
  return factory;
};
/**
 * Template with custom add button, necessary for accessiblity and internationalization.
 */
export const CustomObjectTemplateFactory = (
  translator: ITranslator
): React.FC<ObjectFieldTemplateProps> => {
  const trans = translator.load('jupyterlab');

  const factory = (props: ObjectFieldTemplateProps) => {
    const { TitleField, DescriptionField } = props;
    return (
      <fieldset id={props.idSchema.$id}>
        {(props.uiSchema['ui:title'] || props.title) && (
          <TitleField
            id={`${props.idSchema.$id}__title`}
            title={props.title || props.uiSchema['ui:title']}
            required={props.required}
          />
        )}
        {props.description && (
          <DescriptionField
            id={`${props.idSchema.$id}__description`}
            description={props.description}
          />
        )}
        {props.properties.map(property => property.content)}
        {utils.canExpand(props.schema, props.uiSchema, props.formData) && (
          <button
            className="jp-mod-styled jp-mod-reject"
            onClick={props.onAddClick(props.schema)}
            disabled={props.disabled || props.readonly}
          >
            {trans.__('Add')}
          </button>
        )}
      </fieldset>
    );
  };
  factory.displayName = 'JupyterLabObjectTemplate';
  return factory;
};

/**
 * Renders the modified indicator and errors
 */
export const CustomTemplateFactory = (
  translator: ITranslator
): React.FC<FieldTemplateProps> => {
  const trans = translator.load('jupyterlab');

  const factory = (props: FieldTemplateProps) => {
    const {
      schema,
      label,
      displayLabel,
      id,
      errors,
      rawErrors,
      children,
      onKeyChange,
      onDropPropertyClick
    } = props;
    /**
     * Determine if the field has been modified
     * Schema Id is formatted as 'root_<field name>.<nexted field name>'
     * This logic parses out the field name to find the default value
     * before determining if the field has been modified.
     */
    const schemaIds = id.split('_');
    schemaIds.shift();
    const schemaId = schemaIds.join('.');
    const isRoot = schemaId === '';

    const needsDescription = !isRoot && schema.type !== 'object';

    // While we can implement "remove" button for array items in array template,
    // object templates do not provide a way to do this; instead we need to add
    // buttons here (and first check if the field can be removed = is additional).
    const isAdditional = Object.prototype.hasOwnProperty.call(
      schema,
      utils.ADDITIONAL_PROPERTY_FLAG
    );

    return (
      <div
        className={`form-group ${
          displayLabel || schema.type === 'boolean' ? 'small-field' : ''
        }`}
      >
        {
          // Shows a red indicator for fields that have validation errors
          rawErrors && (
            <div className="jp-modifiedIndicator jp-errorIndicator" />
          )
        }
        <div className="jp-FormGroup-content">
          {displayLabel && !isRoot && label && !isAdditional && (
            <h3 className="jp-FormGroup-fieldLabel jp-FormGroup-contentItem">
              {label}
            </h3>
          )}
          {isAdditional && (
            <input
              className="jp-FormGroup-contentItem jp-mod-styled"
              type="text"
              onBlur={event => onKeyChange(event.target.value)}
              defaultValue={label}
            />
          )}
          <div
            className={`${
              isRoot
                ? 'jp-root'
                : schema.type === 'object'
                ? 'jp-objectFieldWrapper'
                : 'jp-inputFieldWrapper jp-FormGroup-contentItem'
            }`}
          >
            {children}
          </div>
          {isAdditional && (
            <button
              className="jp-FormGroup-contentItem jp-mod-styled jp-mod-warn jp-FormGroup-removeButton"
              onClick={onDropPropertyClick(label)}
            >
              {trans.__('Remove')}
            </button>
          )}
          {schema.description && needsDescription && (
            <div className="jp-FormGroup-description">{schema.description}</div>
          )}
          <div className="validationErrors">{errors}</div>
        </div>
      </div>
    );
  };
  factory.displayName = 'JupyterLabFieldTemplate';
  return factory;
};
